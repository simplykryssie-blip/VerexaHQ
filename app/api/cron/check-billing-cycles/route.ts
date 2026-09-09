import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { previewUpcomingInvoiceAmount, chargeOffSession, createCustomerBalanceCredit } from "@/lib/stripe/client";
import { withJobLogging } from "@/lib/cron/withJobLogging";

export const dynamic = "force-dynamic";

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

function chicagoDateStr(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

function daysBetween(fromDateStr: string, toDateStr: string): number {
  const [fy, fm, fd] = fromDateStr.split("-").map(Number);
  const [ty, tm, td] = toDateStr.split("-").map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86400000);
}

/**
 * Platform-wide billing dunning, run hourly. Uses America/Chicago calendar
 * dates (not a fixed UTC cron offset) so the day boundaries this logic
 * keys off of -- 5 days out, 3 days out, past the cycle end -- land on true
 * CST/CDT midnight year-round, including across the DST changeover.
 *
 * Three things happen, keyed off days-until-current_period_end in Chicago
 * calendar days:
 *  - day 5: no card on file yet -> reminder notification.
 *  - day 3 and day 0: attempt to charge the card on file for the previewed
 *    upcoming-invoice amount. A successful charge is credited to the Stripe
 *    customer's balance (not charged again) -- see createCustomerBalanceCredit
 *    for why that avoids double-charging on the real renewal date. Day 0 is
 *    a last-chance retry for anyone who added a card after a day-3 decline.
 *  - once the cycle end has passed with no successful charge recorded for
 *    it: suspend the workspace. This is independent of (and can fire before)
 *    Stripe's own Smart Retries exhausting into an "unpaid" subscription
 *    status, since that can take longer than a single billing cycle.
 */
async function handleGET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const today = chicagoDateStr(new Date());

  const { data: subs, error } = await supabase
    .from("workspace_subscriptions")
    .select(
      "id, workspace_id, stripe_customer_id, stripe_subscription_id, stripe_status, current_period_end, default_payment_method_id, workspaces(status)"
    )
    .in("stripe_status", ["active", "trialing", "past_due"])
    .not("current_period_end", "is", null)
    .not("stripe_customer_id", "is", null)
    .not("stripe_subscription_id", "is", null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const results = { reminded: 0, charged: 0, chargeFailed: 0, suspended: 0, skipped: 0 };

  for (const sub of subs ?? []) {
    const periodEnd = chicagoDateStr(new Date(sub.current_period_end as string));
    const daysUntil = daysBetween(today, periodEnd);
    const workspaceStatus = (sub.workspaces as unknown as { status: string } | null)?.status;

    if (daysUntil === 5 && !sub.default_payment_method_id) {
      const { data: existing } = await supabase
        .from("notification_queue")
        .select("id")
        .eq("dedupe_key", `billing-card-reminder:${sub.workspace_id}:${periodEnd}`)
        .maybeSingle();
      if (!existing) {
        const { data: admin } = await supabase.rpc("get_workspace_billing_admin", { p_workspace_id: sub.workspace_id }).maybeSingle();
        if (admin?.user_id) {
          await supabase.from("notification_queue").insert({
            workspace_id: sub.workspace_id,
            channel: "Email",
            template_key: "billing-card-reminder",
            event_type: "billing_card_reminder",
            payload: { period_end: periodEnd },
            recipient_user_id: admin.user_id,
            recipient_email: admin.email,
            dedupe_key: `billing-card-reminder:${sub.workspace_id}:${periodEnd}`,
          });
          results.reminded += 1;
        }
      }
    }

    if (daysUntil === 3 || daysUntil === 0) {
      const { data: succeeded } = await supabase
        .from("workspace_billing_charge_attempts")
        .select("id")
        .eq("workspace_id", sub.workspace_id)
        .eq("period_end", sub.current_period_end)
        .eq("status", "succeeded")
        .maybeSingle();

      const { data: attemptedToday } = await supabase
        .from("workspace_billing_charge_attempts")
        .select("id, attempted_at")
        .eq("workspace_id", sub.workspace_id)
        .eq("period_end", sub.current_period_end)
        .order("attempted_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const alreadyAttemptedToday = attemptedToday && chicagoDateStr(new Date(attemptedToday.attempted_at)) === today;

      if (!succeeded && !alreadyAttemptedToday) {
        if (!sub.default_payment_method_id) {
          await supabase.from("workspace_billing_charge_attempts").insert({
            workspace_id: sub.workspace_id,
            period_end: sub.current_period_end,
            amount_cents: 0,
            status: "failed",
            failure_reason: "No payment method on file.",
          });
          results.chargeFailed += 1;
          if (daysUntil === 3) {
            await notifyPaymentFailed(supabase, sub.workspace_id, "No payment method on file.", periodEnd);
          }
        } else {
          const preview = await previewUpcomingInvoiceAmount(sub.stripe_subscription_id as string);
          const amountDueCents = preview.ok ? preview.data.amountDueCents : 0;

          if (!preview.ok || amountDueCents <= 0) {
            await supabase.from("workspace_billing_charge_attempts").insert({
              workspace_id: sub.workspace_id,
              period_end: sub.current_period_end,
              amount_cents: 0,
              status: "succeeded",
            });
            results.charged += 1;
          } else {
            const charge = await chargeOffSession({
              customerId: sub.stripe_customer_id as string,
              paymentMethodId: sub.default_payment_method_id,
              amountCents: amountDueCents,
              description: `Verexa subscription -- cycle ending ${periodEnd}`,
              metadata: { workspace_id: sub.workspace_id, period_end: periodEnd },
            });

            if (charge.ok && charge.data.status === "succeeded") {
              await createCustomerBalanceCredit({
                customerId: sub.stripe_customer_id as string,
                amountCents: amountDueCents,
                description: `Pre-cycle payment for cycle ending ${periodEnd}`,
              });
              await supabase.from("workspace_billing_charge_attempts").insert({
                workspace_id: sub.workspace_id,
                period_end: sub.current_period_end,
                amount_cents: amountDueCents,
                stripe_payment_intent_id: charge.data.id,
                status: "succeeded",
              });
              results.charged += 1;
            } else {
              const reason = charge.ok ? `Payment intent status: ${charge.data.status}` : charge.reason;
              await supabase.from("workspace_billing_charge_attempts").insert({
                workspace_id: sub.workspace_id,
                period_end: sub.current_period_end,
                amount_cents: amountDueCents,
                stripe_payment_intent_id: charge.ok ? charge.data.id : null,
                status: "failed",
                failure_reason: reason,
              });
              results.chargeFailed += 1;
              if (daysUntil === 3) {
                await notifyPaymentFailed(supabase, sub.workspace_id, reason, periodEnd);
              }
            }
          }
        }
      } else {
        results.skipped += 1;
      }
    }

    if (daysUntil < 0 && workspaceStatus === "active") {
      const { data: succeeded } = await supabase
        .from("workspace_billing_charge_attempts")
        .select("id")
        .eq("workspace_id", sub.workspace_id)
        .eq("period_end", sub.current_period_end)
        .eq("status", "succeeded")
        .maybeSingle();

      if (!succeeded) {
        await supabase.from("workspaces").update({ status: "suspended", suspension_reason: "billing_past_due" }).eq("id", sub.workspace_id).eq("status", "active");
        results.suspended += 1;
      }
    }
  }

  return NextResponse.json({ ok: true, ...results });
}

async function notifyPaymentFailed(supabase: ReturnType<typeof createServiceClient>, workspaceId: string, failureReason: string, periodEnd: string) {
  const { data: admin } = await supabase.rpc("get_workspace_billing_admin", { p_workspace_id: workspaceId }).maybeSingle();
  if (!admin?.user_id) return;
  await supabase.from("notification_queue").insert({
    workspace_id: workspaceId,
    channel: "Email",
    template_key: "billing-payment-failed",
    event_type: "billing_payment_failed",
    payload: { failure_reason: failureReason, period_end: periodEnd },
    recipient_user_id: admin.user_id,
    recipient_email: admin.email,
    dedupe_key: `billing-payment-failed:${workspaceId}:${periodEnd}`,
  });
}

export const GET = withJobLogging("check-billing-cycles", handleGET);
