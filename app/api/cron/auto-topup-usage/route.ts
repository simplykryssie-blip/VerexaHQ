import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { chargeOffSession } from "@/lib/stripe/client";
import { withJobLogging } from "@/lib/cron/withJobLogging";

export const dynamic = "force-dynamic";

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

// Email is priced per 1,000 (Resend-style); SMS and storage are priced per
// single unit -- matches UNITS_PER_RATE in the manual usage-topup-checkout
// route and PlanUsageManager, so an auto top-up buys the exact same amount
// of capacity per dollar a manual one would.
const UNITS_PER_RATE: Record<string, number> = { email: 1000, sms: 1, storage: 1 };

// Hourly bucket: if this cron somehow runs twice for the same
// workspace/category within the same clock hour, chargeOffSession's
// Idempotency-Key makes Stripe return the SAME PaymentIntent instead of a
// second charge.
function idempotencyKey(workspaceId: string, resourceType: string): string {
  const hourBucket = new Date().toISOString().slice(0, 13);
  return `auto-topup:${workspaceId}:${resourceType}:${hourBucket}`;
}

/**
 * Automatic prepaid top-up (Part 6): finds every category, across every
 * workspace, that has auto top-up enabled and has actually run out (free
 * allowance and prepaid balance both exhausted -- see
 * find_workspaces_needing_auto_topup), charges the workspace's card on file
 * for that category's configured amount, and only on a genuinely successful
 * charge credits that SAME category's balance. A failed charge adds zero
 * balance and never borrows from another category -- each row from the RPC
 * is one specific (workspace, resource_type) pair, and only that pair's
 * balance is ever touched.
 */
async function handleGET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const { data: candidates, error } = await supabase.rpc("find_workspaces_needing_auto_topup");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const results = { credited: 0, failed: 0, skipped: 0 };

  for (const candidate of candidates ?? []) {
    if (!candidate.rate_cents || candidate.rate_cents <= 0 || !candidate.stripe_customer_id || !candidate.default_payment_method_id) {
      results.skipped += 1;
      continue;
    }

    const unitsPerRate = UNITS_PER_RATE[candidate.resource_type] ?? 1;
    const units = (candidate.amount_cents / candidate.rate_cents) * unitsPerRate;

    const charge = await chargeOffSession({
      customerId: candidate.stripe_customer_id,
      paymentMethodId: candidate.default_payment_method_id,
      amountCents: candidate.amount_cents,
      description: `Verexa automatic ${candidate.resource_type} top-up`,
      metadata: { type: "auto_usage_topup", workspace_id: candidate.workspace_id, resource_type: candidate.resource_type },
      idempotencyKey: idempotencyKey(candidate.workspace_id, candidate.resource_type),
    });

    if (!charge.ok || charge.data.status !== "succeeded") {
      // Zero balance added, no negative balance, no borrowing -- the
      // category simply stays stopped until the owner adds a card or tops
      // up manually. Ledgered so it's visible why nothing changed.
      await supabase.from("workspace_usage_ledger").insert({
        workspace_id: candidate.workspace_id,
        resource_type: candidate.resource_type,
        entry_type: "AUTO_TOPUP_FAILED",
        units: 0,
        metadata: { amount_cents: candidate.amount_cents, reason: charge.ok ? charge.data.status : charge.reason },
      });
      results.failed += 1;
      continue;
    }

    const shouldCredit = await supabase.rpc("claim_auto_topup_charge", {
      p_workspace_id: candidate.workspace_id,
      p_resource_type: candidate.resource_type,
      p_stripe_payment_intent_id: charge.data.id,
      p_amount_cents: candidate.amount_cents,
      p_units: units,
    });

    if (shouldCredit.data) {
      await supabase.rpc("credit_prepaid_balance", {
        p_workspace_id: candidate.workspace_id,
        p_resource_type: candidate.resource_type,
        p_units: units,
      });
      await supabase.rpc("mark_auto_topup_charge_credited", { p_stripe_payment_intent_id: charge.data.id });
      results.credited += 1;
    } else {
      // Already credited for this exact PaymentIntent on a previous tick
      // (crash-and-retry) -- crediting again would double-credit real money.
      results.skipped += 1;
    }
  }

  return NextResponse.json({ ok: true, ...results });
}

export const GET = withJobLogging("auto-topup-usage", handleGET);
