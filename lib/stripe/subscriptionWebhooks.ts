import { createServiceClient } from "@/lib/supabase/service";
import { updateSubscriptionItemPrice } from "@/lib/stripe/client";
import type { Database } from "@/lib/database.types";

type WorkspaceSubscriptionUpdate = Database["public"]["Tables"]["workspace_subscriptions"]["Update"];

type StripeSubscription = {
  id: string;
  customer: string | { id: string };
  status: string;
  current_period_start: number;
  current_period_end: number;
  trial_end: number | null;
  cancel_at_period_end?: boolean;
  metadata?: { workspace_id?: string };
  items: { data: Array<{ id: string; price: { id: string } }> };
};

type StripeInvoice = {
  id: string;
  subscription: string | { id: string } | null;
  amount_due: number;
  amount_paid: number;
  status: string;
  period_start: number | null;
  period_end: number | null;
  hosted_invoice_url: string | null;
};

type PlanSnapshot = {
  base_price_cents: number;
  per_seat_price_cents: number;
  email_overage_rate_cents: number;
  storage_overage_rate_cents: number;
  sms_overage_rate_cents: number;
  currency: string;
  locked_at: string;
};

function toIso(unixSeconds: number | null): string | null {
  return unixSeconds ? new Date(unixSeconds * 1000).toISOString() : null;
}

function snapshotFromPlan(plan: {
  base_price_cents: number;
  per_seat_price_cents: number;
  email_overage_rate_cents: number;
  storage_overage_rate_cents: number;
  sms_overage_rate_cents: number;
  currency: string;
}): PlanSnapshot {
  return {
    base_price_cents: plan.base_price_cents,
    per_seat_price_cents: plan.per_seat_price_cents,
    email_overage_rate_cents: plan.email_overage_rate_cents,
    storage_overage_rate_cents: plan.storage_overage_rate_cents,
    sms_overage_rate_cents: plan.sms_overage_rate_cents,
    currency: plan.currency,
    locked_at: new Date().toISOString(),
  };
}

function customerId(customer: StripeSubscription["customer"]): string {
  return typeof customer === "string" ? customer : customer.id;
}

function subscriptionId(subscription: StripeInvoice["subscription"]): string | null {
  if (!subscription) return null;
  return typeof subscription === "string" ? subscription : subscription.id;
}

/**
 * A workspace is paused for billing only once Stripe's retries are
 * exhausted (status "unpaid"), never on the first failed attempt
 * ("past_due") -- that's still inside the retry window before the due date.
 * Only ever touches a workspace that's currently active, so an
 * already-archived workspace is left alone.
 */
async function pauseWorkspaceForBilling(supabase: ReturnType<typeof createServiceClient>, workspaceId: string) {
  await supabase
    .from("workspaces")
    .update({ status: "suspended", suspension_reason: "billing_past_due" })
    .eq("id", workspaceId)
    .eq("status", "active");
}

/**
 * Only reactivates a workspace suspended for one of the given billing
 * reasons -- never overrides a manual suspension unrelated to payment.
 */
async function resumeWorkspaceFromBilling(
  supabase: ReturnType<typeof createServiceClient>,
  workspaceId: string,
  allowedReasons: string[] = ["billing_past_due"]
) {
  await supabase
    .from("workspaces")
    .update({ status: "active", suspension_reason: null })
    .eq("id", workspaceId)
    .in("suspension_reason", allowedReasons);
}

/**
 * cancel_at_period_end: true (set via Stripe's hosted Customer Portal) means
 * the workspace already had full access through its paid term -- this event
 * fires only once that term has actually ended, so lock out immediately,
 * no grace period. No refund logic here; none was requested for
 * cancellation.
 *
 * v2, not implemented: once a credit-ledger system exists for seat/usage
 * top-ups, any unused top-up balance must be forfeited (not refunded) here.
 */
async function lockWorkspaceForCancellation(supabase: ReturnType<typeof createServiceClient>, workspaceId: string) {
  await supabase
    .from("workspaces")
    .update({ status: "suspended", suspension_reason: "subscription_canceled" })
    .eq("id", workspaceId)
    .neq("status", "archived");
}

export async function handleSubscriptionCreated(
  supabase: ReturnType<typeof createServiceClient>,
  subscription: StripeSubscription
): Promise<{ skipped?: string }> {
  const workspaceId = subscription.metadata?.workspace_id;
  if (!workspaceId) return { skipped: "missing workspace_id metadata" };

  const priceId = subscription.items.data[0]?.price?.id;
  const { data: plan } = await supabase.from("platform_subscription_plans").select("*").eq("stripe_price_id", priceId).maybeSingle();
  if (!plan) return { skipped: "no plan matches this subscription's price" };

  await supabase.from("workspace_subscriptions").upsert(
    {
      workspace_id: workspaceId,
      plan_id: plan.id,
      stripe_customer_id: customerId(subscription.customer),
      stripe_subscription_id: subscription.id,
      stripe_status: subscription.status,
      current_period_start: toIso(subscription.current_period_start),
      current_period_end: toIso(subscription.current_period_end),
      trial_end: toIso(subscription.trial_end),
      cancel_at_period_end: subscription.cancel_at_period_end ?? false,
      locked_plan_snapshot: snapshotFromPlan(plan),
    },
    { onConflict: "workspace_id" }
  );

  // A brand-new subscription always clears whatever billing lock the
  // workspace was under -- a past-due pause or a prior cancellation.
  await resumeWorkspaceFromBilling(supabase, workspaceId, ["billing_past_due", "subscription_canceled"]);

  return {};
}

export async function handleSubscriptionUpdated(
  supabase: ReturnType<typeof createServiceClient>,
  subscription: StripeSubscription
): Promise<{ skipped?: string }> {
  const { data: existing } = await supabase
    .from("workspace_subscriptions")
    .select("id, workspace_id, plan_id, current_period_end, price_change_effective_date")
    .eq("stripe_subscription_id", subscription.id)
    .maybeSingle();

  if (!existing) {
    return handleSubscriptionCreated(supabase, subscription);
  }

  const newPeriodEnd = toIso(subscription.current_period_end);
  const isNewCycle = existing.current_period_end !== newPeriodEnd;

  const updates: WorkspaceSubscriptionUpdate = {
    stripe_status: subscription.status,
    current_period_start: toIso(subscription.current_period_start),
    current_period_end: newPeriodEnd,
    trial_end: toIso(subscription.trial_end),
    cancel_at_period_end: subscription.cancel_at_period_end ?? false,
  };

  // Apply a pending grandfathered price migration exactly at the renewal
  // where its effective date has been reached -- never mid-cycle. Early
  // renewals before that date are already billing at the old price with no
  // action needed here, since we haven't touched the Stripe subscription's
  // Price object yet.
  if (
    isNewCycle &&
    existing.price_change_effective_date &&
    new Date(existing.price_change_effective_date) <= new Date(subscription.current_period_start * 1000)
  ) {
    const { data: plan } = await supabase.from("platform_subscription_plans").select("*").eq("id", existing.plan_id).single();
    const subscriptionItemId = subscription.items.data[0]?.id;
    if (plan?.stripe_price_id && subscriptionItemId) {
      const result = await updateSubscriptionItemPrice({ subscriptionItemId, priceId: plan.stripe_price_id });
      if (result.ok) {
        updates.locked_plan_snapshot = snapshotFromPlan(plan);
        updates.price_change_notice_sent_at = null;
        updates.price_change_effective_date = null;
      }
    }
  }

  await supabase.from("workspace_subscriptions").update(updates).eq("id", existing.id);

  if (subscription.status === "unpaid") {
    await pauseWorkspaceForBilling(supabase, existing.workspace_id);
  } else if (subscription.status === "active" || subscription.status === "trialing") {
    await resumeWorkspaceFromBilling(supabase, existing.workspace_id);
  }

  return {};
}

export async function handleSubscriptionDeleted(
  supabase: ReturnType<typeof createServiceClient>,
  subscription: StripeSubscription
): Promise<{ skipped?: string }> {
  const { data: existing } = await supabase
    .from("workspace_subscriptions")
    .select("workspace_id")
    .eq("stripe_subscription_id", subscription.id)
    .maybeSingle();

  await supabase.from("workspace_subscriptions").update({ stripe_status: "canceled" }).eq("stripe_subscription_id", subscription.id);

  if (existing?.workspace_id) {
    await lockWorkspaceForCancellation(supabase, existing.workspace_id);
  }

  return {};
}

export async function handleTrialWillEnd(
  supabase: ReturnType<typeof createServiceClient>,
  subscription: StripeSubscription
): Promise<{ skipped?: string }> {
  const { data: sub } = await supabase
    .from("workspace_subscriptions")
    .select("id, workspace_id, trial_end")
    .eq("stripe_subscription_id", subscription.id)
    .maybeSingle();
  if (!sub) return { skipped: "no matching subscription" };

  const { data: admin } = await supabase.rpc("get_workspace_billing_admin", { p_workspace_id: sub.workspace_id }).maybeSingle();
  if (!admin?.user_id) return { skipped: "no admin to notify" };

  await supabase
    .from("notification_queue")
    .insert({
      workspace_id: sub.workspace_id,
      channel: "Email",
      template_key: "trial-ending-notice",
      event_type: "trial_will_end",
      payload: { trial_end: sub.trial_end },
      recipient_user_id: admin.user_id,
      recipient_email: admin.email,
      dedupe_key: `trial_will_end:${sub.id}`,
    })
    .select()
    .single();

  return {};
}

export async function handleInvoicePaymentSucceeded(
  supabase: ReturnType<typeof createServiceClient>,
  invoice: StripeInvoice
): Promise<{ skipped?: string }> {
  const stripeSubId = subscriptionId(invoice.subscription);
  if (!stripeSubId) return { skipped: "not a subscription invoice" };

  const { data: sub } = await supabase
    .from("workspace_subscriptions")
    .select("workspace_id")
    .eq("stripe_subscription_id", stripeSubId)
    .maybeSingle();
  if (!sub) return { skipped: "no matching subscription" };

  await supabase.from("workspace_subscription_invoices").upsert(
    {
      workspace_id: sub.workspace_id,
      stripe_invoice_id: invoice.id,
      amount_due: invoice.amount_due,
      amount_paid: invoice.amount_paid,
      status: invoice.status,
      period_start: toIso(invoice.period_start),
      period_end: toIso(invoice.period_end),
      paid_at: new Date().toISOString(),
      hosted_invoice_url: invoice.hosted_invoice_url,
    },
    { onConflict: "stripe_invoice_id" }
  );

  return {};
}

export async function handleInvoicePaymentFailed(
  supabase: ReturnType<typeof createServiceClient>,
  invoice: StripeInvoice
): Promise<{ skipped?: string }> {
  const stripeSubId = subscriptionId(invoice.subscription);
  if (!stripeSubId) return { skipped: "not a subscription invoice" };

  const { data: sub } = await supabase
    .from("workspace_subscriptions")
    .select("workspace_id")
    .eq("stripe_subscription_id", stripeSubId)
    .maybeSingle();
  if (!sub) return { skipped: "no matching subscription" };

  await supabase.from("workspace_subscription_invoices").upsert(
    {
      workspace_id: sub.workspace_id,
      stripe_invoice_id: invoice.id,
      amount_due: invoice.amount_due,
      amount_paid: invoice.amount_paid,
      status: invoice.status,
      period_start: toIso(invoice.period_start),
      period_end: toIso(invoice.period_end),
      hosted_invoice_url: invoice.hosted_invoice_url,
    },
    { onConflict: "stripe_invoice_id" }
  );

  // Access is gated on the subscription's own status (handled in
  // handleSubscriptionUpdated), not on individual invoice failures -- Stripe
  // sends a subscription.updated alongside every status-relevant failure.
  return {};
}
