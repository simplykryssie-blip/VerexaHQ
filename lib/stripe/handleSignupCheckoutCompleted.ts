import { createServiceClient } from "@/lib/supabase/service";
import { retrieveSubscriptionForProvisioning, retrieveCardDetails, getSoleSubscriptionItem } from "@/lib/stripe/client";
import { isSubscriptionStatusPaid } from "@/lib/stripe/subscriptionWebhooks";

type SignupCheckoutSession = {
  id: string;
  subscription: string | { id: string } | null;
  metadata?: { type?: string; pending_signup_id?: string };
};

function subscriptionId(ref: SignupCheckoutSession["subscription"]): string | null {
  if (!ref) return null;
  return typeof ref === "string" ? ref : ref.id;
}

/**
 * Dedicated provisioning path for a brand-new, payment-first signup: no
 * workspace exists yet -- see start_paid_signup and
 * provision_workspace_from_pending_signup (20261019000000_payment_first_signup).
 *
 * checkout.session.completed firing is NOT by itself proof of a paid
 * subscription (a card can still be unconfirmed, e.g. pending 3D Secure) --
 * this always re-reads the actual Subscription object from Stripe and gates
 * provisioning on its real status, the same isSubscriptionStatusPaid check
 * every other subscription activation in this app already uses.
 *
 * Deliberately does not catch a provisioning failure: an error here must
 * propagate to the webhook route's own try/catch, which marks the delivery
 * failed rather than processed, so Stripe retries. That retry is safe
 * because provision_workspace_from_pending_signup is itself idempotent
 * (returns the already-created workspace if this pending signup already
 * converted) -- it is never acceptable to silently swallow this and return
 * success once Stripe has actually been paid.
 */
export async function handleSignupCheckoutCompleted(
  supabase: ReturnType<typeof createServiceClient>,
  session: SignupCheckoutSession
): Promise<{ skipped?: string }> {
  const pendingSignupId = session.metadata?.pending_signup_id;
  if (!pendingSignupId) return { skipped: "missing pending_signup_id metadata" };

  const subId = subscriptionId(session.subscription);
  if (!subId) return { skipped: "checkout session has no subscription" };

  const subResult = await retrieveSubscriptionForProvisioning(subId);
  if (!subResult.ok) {
    throw new Error(`Could not retrieve subscription ${subId} for signup provisioning: ${subResult.reason}`);
  }
  const subscription = subResult.data;

  if (!isSubscriptionStatusPaid(subscription.status)) {
    // Not actually paid yet (e.g. still confirming). If it later becomes
    // active, Stripe's own customer.subscription.updated event fires --
    // handleSubscriptionUpdated's existing !existing fallback calls
    // handleSubscriptionCreated, which harmlessly skips (no metadata.
    // workspace_id on a signup subscription) rather than provisioning
    // twice; a signup stuck non-active is treated the same as any other
    // incomplete/failed payment, not a delayed success this path chases.
    return { skipped: `subscription status is ${subscription.status}, not paid` };
  }

  const itemResult = getSoleSubscriptionItem(subscription.items.data);
  const period = itemResult.ok ? { start: itemResult.data.current_period_start, end: itemResult.data.current_period_end } : { start: null, end: null };

  let cardFields: {
    default_payment_method_id?: string;
    card_brand?: string;
    card_last4?: string;
    card_exp_month?: number;
    card_exp_year?: number;
  } = {};
  if (subscription.default_payment_method) {
    const cardResult = await retrieveCardDetails(subscription.default_payment_method);
    if (cardResult.ok) {
      cardFields = {
        default_payment_method_id: subscription.default_payment_method,
        card_brand: cardResult.data.brand,
        card_last4: cardResult.data.last4,
        card_exp_month: cardResult.data.expMonth,
        card_exp_year: cardResult.data.expYear,
      };
    }
  }

  const { error } = await supabase.rpc("provision_workspace_from_pending_signup", {
    p_pending_signup_id: pendingSignupId,
    p_stripe_customer_id: subscription.customer,
    p_stripe_subscription_id: subscription.id,
    p_stripe_status: subscription.status,
    p_current_period_start: period.start ? new Date(period.start * 1000).toISOString() : undefined,
    p_current_period_end: period.end ? new Date(period.end * 1000).toISOString() : undefined,
    p_trial_end: subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : undefined,
    p_cancel_at_period_end: subscription.cancel_at_period_end ?? false,
    p_default_payment_method_id: cardFields.default_payment_method_id ?? undefined,
    p_card_brand: cardFields.card_brand ?? undefined,
    p_card_last4: cardFields.card_last4 ?? undefined,
    p_card_exp_month: cardFields.card_exp_month ?? undefined,
    p_card_exp_year: cardFields.card_exp_year ?? undefined,
  });
  if (error) {
    throw new Error(`provision_workspace_from_pending_signup failed for pending signup ${pendingSignupId}: ${error.message}`);
  }

  return {};
}
