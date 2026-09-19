import { createServiceClient } from "@/lib/supabase/service";
import {
  updateSubscriptionItemPrice,
  retrieveSetupIntentPaymentMethod,
  retrieveCardDetails,
  setCustomerDefaultPaymentMethod,
  getSoleSubscriptionItem,
} from "@/lib/stripe/client";
import type { Database, Json } from "@/lib/database.types";

type WorkspaceSubscriptionUpdate = Database["public"]["Tables"]["workspace_subscriptions"]["Update"];

type StripeSubscriptionItem = {
  id: string;
  price: { id: string };
  // Billing-period dates live here, not on the subscription itself -- see
  // subscriptionPeriod() below.
  current_period_start: number;
  current_period_end: number;
};

type StripeSubscription = {
  id: string;
  customer: string | { id: string };
  status: string;
  default_payment_method?: string | { id: string } | null;
  trial_end: number | null;
  cancel_at_period_end?: boolean;
  metadata?: { workspace_id?: string; plan_slug?: string };
  items: { data: StripeSubscriptionItem[] };
};

type StripeInvoice = {
  id: string;
  subscription: string | { id: string } | null;
  // Newer Stripe API versions moved the subscription reference here instead
  // of the flat `subscription` field above -- see subscriptionId() below.
  parent?: {
    subscription_details?: { subscription?: string | { id: string } | null } | null;
  } | null;
  amount_due: number;
  amount_paid: number;
  status: string;
  period_start: number | null;
  period_end: number | null;
  hosted_invoice_url: string | null;
  // Present once Stripe Tax is actually calculating something (automatic_tax
  // is enabled on the Checkout Session that created the subscription -- see
  // lib/stripe/client.ts -- and at least one tax registration exists for the
  // customer's jurisdiction). Both null/absent on every invoice today, since
  // the account currently has zero registrations -- see the Stripe Tax audit.
  total?: number;
  total_excluding_tax?: number | null;
  total_taxes?: unknown[];
};

type PlanSnapshot = {
  base_price_cents: number;
  per_seat_price_cents: number;
  email_overage_rate_cents_per_1000: number;
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
  email_overage_rate_cents_per_1000: number;
  storage_overage_rate_cents: number;
  sms_overage_rate_cents: number;
  currency: string;
}): PlanSnapshot {
  return {
    base_price_cents: plan.base_price_cents,
    per_seat_price_cents: plan.per_seat_price_cents,
    email_overage_rate_cents_per_1000: plan.email_overage_rate_cents_per_1000,
    storage_overage_rate_cents: plan.storage_overage_rate_cents,
    sms_overage_rate_cents: plan.sms_overage_rate_cents,
    currency: plan.currency,
    locked_at: new Date().toISOString(),
  };
}

function customerId(customer: StripeSubscription["customer"]): string {
  return typeof customer === "string" ? customer : customer.id;
}

function refId(ref: string | { id: string } | null | undefined): string | null {
  if (!ref) return null;
  return typeof ref === "string" ? ref : ref.id;
}

// Billing-period dates moved off the top-level Subscription object onto its
// sole item in current Stripe API versions -- same root cause as
// subscriptionId() above, just for a different pair of fields. Never guesses
// items.data[0]: an unresolvable item (none, or more than one) fails closed
// to {start: null, end: null} rather than reading the wrong item's dates.
function subscriptionPeriod(items: StripeSubscriptionItem[]): { start: number | null; end: number | null } {
  const itemResult = getSoleSubscriptionItem(items);
  if (!itemResult.ok) return { start: null, end: null };
  return { start: itemResult.data.current_period_start, end: itemResult.data.current_period_end };
}

// Captures the subscription's default payment method for the billing UI --
// mirrors handleSetupCheckoutCompleted's own capture below, just triggered
// from the subscription lifecycle instead of the separate "Add a card" flow.
// Returns {} (a no-op merge) whenever there's nothing to safely report,
// rather than writing partial/null card fields over whatever is already
// stored -- no payment method, or a failed Stripe read, both fail closed.
async function subscriptionCardFields(
  defaultPaymentMethod: StripeSubscription["default_payment_method"]
): Promise<Partial<WorkspaceSubscriptionUpdate>> {
  const paymentMethodId = refId(defaultPaymentMethod);
  if (!paymentMethodId) return {};

  const cardResult = await retrieveCardDetails(paymentMethodId);
  if (!cardResult.ok) return {};

  return {
    default_payment_method_id: paymentMethodId,
    card_brand: cardResult.data.brand,
    card_last4: cardResult.data.last4,
    card_exp_month: cardResult.data.expMonth,
    card_exp_year: cardResult.data.expYear,
  };
}

// invoice.subscription (the flat field) is null on every LIVE invoice.payment_succeeded
// event this app has ever received (confirmed via webhook_events.payload) -- current
// Stripe API versions carry it at invoice.parent.subscription_details.subscription
// instead. Check the flat field first (older API versions / any invoice that still
// carries it) and fall back to the nested location; an invoice with neither is
// genuinely not tied to a subscription.
function subscriptionId(invoice: StripeInvoice): string | null {
  return refId(invoice.subscription) ?? refId(invoice.parent?.subscription_details?.subscription);
}

/**
 * Exported for testing. Normalizes the tax-specific slice of an invoice
 * rather than storing the whole Stripe object: tax_amount is derived (total
 * minus total_excluding_tax) instead of trusting Stripe to sum total_taxes
 * consistently, and tax_details is only the tax breakdown array, not the
 * invoice itself. All three are null when total_excluding_tax is absent --
 * either automatic_tax isn't enabled on this subscription, or (today, for
 * every real invoice) it is but no tax registration exists yet to compute
 * anything against.
 */
export function taxFieldsFromInvoice(invoice: StripeInvoice): { tax_amount: number | null; total_excluding_tax: number | null; tax_details: Json | null } {
  if (invoice.total_excluding_tax == null || invoice.total == null) {
    return { tax_amount: null, total_excluding_tax: null, tax_details: null };
  }
  return {
    tax_amount: invoice.total - invoice.total_excluding_tax,
    total_excluding_tax: invoice.total_excluding_tax,
    tax_details: invoice.total_taxes && invoice.total_taxes.length > 0 ? (invoice.total_taxes as unknown as Json) : null,
  };
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
 * Also requires the workspace to currently be "suspended": a stale or
 * duplicate webhook reporting a paid subscription must never reactivate a
 * workspace that has already progressed to archived/permanently_archived
 * (those states carry their own recovery path, not a plain status flip),
 * even though suspension_reason is left unset by the archive-lifecycle
 * cron and would otherwise still match.
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
    .eq("status", "suspended")
    .in("suspension_reason", allowedReasons);
}

// The complete set of billing suspension_reason values (matches
// workspaces_suspension_reason_check) that a genuinely paid subscription
// proves are resolved -- billing_incomplete is create_paid_workspace's
// initial lock on every brand-new signup; billing_past_due/
// subscription_canceled are the two pre-existing recovery cases. Shared by
// handleSubscriptionCreated and handleSubscriptionUpdated so a signup's
// lock clears identically regardless of which event happens to carry the
// transition to "active" first (see isSubscriptionStatusPaid below).
const REASONS_CLEARED_BY_PAID_SUBSCRIPTION = ["billing_past_due", "subscription_canceled", "billing_incomplete"];

/**
 * Exported for testing. A subscription's own status is the only thing that
 * actually proves billing succeeded -- Stripe can create or update a
 * subscription to a non-active status (still confirming, past_due, unpaid,
 * canceled), and neither handleSubscriptionCreated nor handleSubscriptionUpdated
 * may treat the workspace as paid unless this is true for that event's
 * subscription object.
 */
export function isSubscriptionStatusPaid(status: string): boolean {
  return status === "active" || status === "trialing";
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
  // Only ever moves active/suspended -> suspended. A late
  // customer.subscription.deleted event must never regress an already
  // archived or permanently archived workspace back to suspended --
  // excluding just "archived" (the original guard) missed
  // permanently_archived entirely.
  await supabase
    .from("workspaces")
    .update({ status: "suspended", suspension_reason: "subscription_canceled" })
    .eq("id", workspaceId)
    .in("status", ["active", "suspended"]);
}

export async function handleSubscriptionCreated(
  supabase: ReturnType<typeof createServiceClient>,
  subscription: StripeSubscription
): Promise<{ skipped?: string }> {
  const workspaceId = subscription.metadata?.workspace_id;
  if (!workspaceId) return { skipped: "missing workspace_id metadata" };

  // Doesn't assume items.data[0] is the right item -- if this subscription
  // ever has more than one item, priceId is left undefined here and
  // resolution falls straight through to the plan_slug fallback below
  // rather than risking a match against the wrong item's price.
  const itemResult = getSoleSubscriptionItem(subscription.items.data);
  const priceId = itemResult.ok ? itemResult.data.price?.id : undefined;
  let { data: plan } = priceId
    ? await supabase.from("platform_subscription_plans").select("*").eq("stripe_price_id", priceId).maybeSingle()
    : { data: null };
  // Platform plans don't have real Stripe Price objects yet (their checkout
  // session is built from an ad-hoc price_data line item, same as Packages
  // -- see createSubscriptionCheckoutSession) -- fall back to the plan slug
  // the checkout route stamped into this subscription's own metadata.
  if (!plan && subscription.metadata?.plan_slug) {
    ({ data: plan } = await supabase.from("platform_subscription_plans").select("*").eq("slug", subscription.metadata.plan_slug).maybeSingle());
  }
  if (!plan) return { skipped: "no plan matches this subscription's price" };

  const period = subscriptionPeriod(subscription.items.data);
  const cardFields = await subscriptionCardFields(subscription.default_payment_method);

  await supabase.from("workspace_subscriptions").upsert(
    {
      workspace_id: workspaceId,
      plan_id: plan.id,
      stripe_customer_id: customerId(subscription.customer),
      stripe_subscription_id: subscription.id,
      stripe_status: subscription.status,
      current_period_start: toIso(period.start),
      current_period_end: toIso(period.end),
      trial_end: toIso(subscription.trial_end),
      cancel_at_period_end: subscription.cancel_at_period_end ?? false,
      locked_plan_snapshot: snapshotFromPlan(plan),
      ...cardFields,
    },
    { onConflict: "workspace_id" }
  );

  // subscription.created can fire with a non-active status (e.g. still
  // confirming) -- see the comment below on the free-allowance grant for
  // why that's treated as real here too. workspaceId is this event's own
  // metadata, so this can never touch a different workspace's suspension.
  if (isSubscriptionStatusPaid(subscription.status)) {
    await resumeWorkspaceFromBilling(supabase, workspaceId, REASONS_CLEARED_BY_PAID_SUBSCRIPTION);
  }

  // Deliberately does NOT grant the free usage allowance here.
  // subscription.created fires the moment Stripe creates the subscription
  // object -- before the card is actually confirmed -- so granting here
  // would hand out free usage capacity that was never actually paid for.
  // The allowance is granted from handleInvoicePaymentSucceeded instead,
  // which only fires once the first invoice is genuinely paid. See
  // grant_workspace_usage_meters's own ON CONFLICT DO NOTHING for why
  // calling it from every invoice.payment_succeeded (renewals included) is
  // still exactly one-time.

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

  const period = subscriptionPeriod(subscription.items.data);
  const newPeriodEnd = toIso(period.end);
  const isNewCycle = existing.current_period_end !== newPeriodEnd;
  const cardFields = await subscriptionCardFields(subscription.default_payment_method);

  const updates: WorkspaceSubscriptionUpdate = {
    stripe_status: subscription.status,
    current_period_start: toIso(period.start),
    current_period_end: newPeriodEnd,
    trial_end: toIso(subscription.trial_end),
    cancel_at_period_end: subscription.cancel_at_period_end ?? false,
    ...cardFields,
  };

  // Apply a pending grandfathered price migration exactly at the renewal
  // where its effective date has been reached -- never mid-cycle. Early
  // renewals before that date are already billing at the old price with no
  // action needed here, since we haven't touched the Stripe subscription's
  // Price object yet. period.start being unresolvable (see
  // subscriptionPeriod above) fails this closed for the cycle rather than
  // risking a migration timed off a wrong/missing date.
  if (
    isNewCycle &&
    existing.price_change_effective_date &&
    period.start !== null &&
    new Date(existing.price_change_effective_date) <= new Date(period.start * 1000)
  ) {
    const { data: plan } = await supabase.from("platform_subscription_plans").select("*").eq("id", existing.plan_id).single();
    // Doesn't assume items.data[0] is the item to migrate -- if this
    // subscription ever has more than one item, the migration is skipped
    // for this cycle (price_change_effective_date/notice are left
    // untouched, so it safely retries next cycle) rather than risking a
    // price change on the wrong item.
    const itemResult = getSoleSubscriptionItem(subscription.items.data);
    const subscriptionItemId = itemResult.ok ? itemResult.data.id : undefined;
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
  } else if (isSubscriptionStatusPaid(subscription.status)) {
    // Same billing_incomplete case as handleSubscriptionCreated above: a
    // signup's subscription can still be created non-active and only reach
    // "active" via a later update (e.g. a delayed payment-method
    // confirmation) -- this is the only other point that transition can be
    // observed, so it needs the same allowed-reasons list.
    await resumeWorkspaceFromBilling(supabase, existing.workspace_id, REASONS_CLEARED_BY_PAID_SUBSCRIPTION);
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

/**
 * A workspace admin completed the "Add a card" hosted Setup Checkout
 * (createSetupCheckoutSession, mode "setup" -- saves a payment method
 * without charging anything). Resolves the resulting setup intent down to
 * a payment method, makes it the customer's default so Stripe's own
 * automatic renewal charge uses it too, and caches display details on
 * workspace_subscriptions for the billing UI.
 */
export async function handleSetupCheckoutCompleted(
  supabase: ReturnType<typeof createServiceClient>,
  session: { id: string; customer: string | { id: string }; setup_intent: string | { id: string } | null; metadata?: { workspace_id?: string } }
): Promise<{ skipped?: string }> {
  const workspaceId = session.metadata?.workspace_id;
  if (!workspaceId) return { skipped: "missing workspace_id metadata" };
  if (!session.setup_intent) return { skipped: "session has no setup_intent" };

  const setupIntentId = typeof session.setup_intent === "string" ? session.setup_intent : session.setup_intent.id;
  const stripeCustomerId = customerId(session.customer);

  const pmResult = await retrieveSetupIntentPaymentMethod(setupIntentId);
  if (!pmResult.ok) return { skipped: pmResult.reason };

  const cardResult = await retrieveCardDetails(pmResult.data.paymentMethodId);
  if (!cardResult.ok) return { skipped: cardResult.reason };

  await setCustomerDefaultPaymentMethod({ customerId: stripeCustomerId, paymentMethodId: pmResult.data.paymentMethodId });

  await supabase
    .from("workspace_subscriptions")
    .update({
      default_payment_method_id: pmResult.data.paymentMethodId,
      card_brand: cardResult.data.brand,
      card_last4: cardResult.data.last4,
      card_exp_month: cardResult.data.expMonth,
      card_exp_year: cardResult.data.expYear,
    })
    .eq("workspace_id", workspaceId);

  return {};
}

export async function handleInvoicePaymentSucceeded(
  supabase: ReturnType<typeof createServiceClient>,
  invoice: StripeInvoice
): Promise<{ skipped?: string }> {
  const stripeSubId = subscriptionId(invoice);
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
      ...taxFieldsFromInvoice(invoice),
    },
    { onConflict: "stripe_invoice_id" }
  );

  // If this payment is for a released staff member's own personal
  // workspace, this is the actual moment their sponsorship transition
  // completes -- not subscription.created (that fires on checkout, before
  // the card is confirmed; gating there would repeat the exact
  // grant-before-payment bug already flagged for usage meters). No-op for
  // every other invoice, since the RPC only acts when a
  // billing_setup_required transition exists for this workspace.
  await supabase.rpc("complete_sponsorship_transition_on_payment", { p_workspace_id: sub.workspace_id });

  // The free usage allowance is granted here -- the first genuinely
  // successful subscription payment -- never from subscription.created.
  // Safe to call on every payment (renewals, plan changes, etc.) because
  // grant_workspace_usage_meters' own ON CONFLICT DO NOTHING makes every
  // call after the first a no-op; the allowance itself never resets.
  await supabase.rpc("grant_workspace_usage_meters", { p_workspace_id: sub.workspace_id });

  return {};
}

export async function handleInvoicePaymentFailed(
  supabase: ReturnType<typeof createServiceClient>,
  invoice: StripeInvoice
): Promise<{ skipped?: string }> {
  const stripeSubId = subscriptionId(invoice);
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
      ...taxFieldsFromInvoice(invoice),
    },
    { onConflict: "stripe_invoice_id" }
  );

  // Access is gated on the subscription's own status (handled in
  // handleSubscriptionUpdated), not on individual invoice failures -- Stripe
  // sends a subscription.updated alongside every status-relevant failure.
  return {};
}
