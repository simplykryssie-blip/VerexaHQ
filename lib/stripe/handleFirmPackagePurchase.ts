import { createServiceClient } from "@/lib/supabase/service";

type CheckoutSession = {
  id: string;
  mode?: string;
  customer?: string | { id: string };
  subscription?: string | { id: string } | null;
  metadata?: { type?: string; purchase_id?: string };
};

function customerId(customer: CheckoutSession["customer"]): string | null {
  if (!customer) return null;
  return typeof customer === "string" ? customer : customer.id;
}

function subscriptionId(subscription: CheckoutSession["subscription"]): string | null {
  if (!subscription) return null;
  return typeof subscription === "string" ? subscription : subscription.id;
}

/**
 * A connected firm finished paying for the package their ERO/Service Bureau
 * assigned them (one-time or the first cycle of a recurring one -- either
 * way this fires once, on session completion). Flips the purchase row
 * active, which is what fire_firm_package_purchase_automations() (an AFTER
 * UPDATE trigger) reacts to -- no automation-firing logic needed here.
 */
export async function handleFirmPackagePurchaseCheckoutCompleted(
  supabase: ReturnType<typeof createServiceClient>,
  session: CheckoutSession
): Promise<{ skipped: string } | { skipped: undefined }> {
  const purchaseId = session.metadata?.purchase_id;
  if (!purchaseId) return { skipped: "missing purchase_id metadata" };

  const { data: purchase } = await supabase.from("firm_package_purchases").select("id, package_id, connection_id").eq("id", purchaseId).maybeSingle();
  if (!purchase) return { skipped: "purchase not found" };

  await supabase
    .from("firm_package_purchases")
    .update({
      status: "active",
      purchased_at: new Date().toISOString(),
      stripe_checkout_session_id: session.id,
      stripe_customer_id: customerId(session.customer),
      stripe_subscription_id: subscriptionId(session.subscription),
    })
    .eq("id", purchaseId);

  // Keeps the seller's own view of the connection consistent -- the intended
  // flow only ever checks out the package already assigned to the
  // connection, but this stays correct even if that changed in between.
  await supabase.from("firm_connections").update({ package_id: purchase.package_id }).eq("id", purchase.connection_id);

  return { skipped: undefined };
}

type StripeSubscription = {
  id: string;
  status: string;
  current_period_end: number;
  metadata?: { type?: string };
};

function mapSubscriptionStatus(stripeStatus: string): "active" | "past_due" | "canceled" | null {
  if (stripeStatus === "active" || stripeStatus === "trialing") return "active";
  if (stripeStatus === "past_due" || stripeStatus === "unpaid" || stripeStatus === "incomplete") return "past_due";
  if (stripeStatus === "canceled") return "canceled";
  return null;
}

/** Keeps a recurring package purchase's status/period in sync with its Stripe subscription -- what makes "renews on its own" trustworthy. */
export async function handleFirmPackageSubscriptionUpdated(
  supabase: ReturnType<typeof createServiceClient>,
  subscription: StripeSubscription
): Promise<{ skipped: string } | { skipped: undefined }> {
  if (subscription.metadata?.type !== "firm_package_purchase") return { skipped: "not a firm package subscription" };

  const status = mapSubscriptionStatus(subscription.status);
  if (!status) return { skipped: `unhandled subscription status: ${subscription.status}` };

  await supabase
    .from("firm_package_purchases")
    .update({
      status,
      current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
      ...(status === "canceled" ? { canceled_at: new Date().toISOString() } : {}),
    })
    .eq("stripe_subscription_id", subscription.id);

  return { skipped: undefined };
}

export async function handleFirmPackageSubscriptionDeleted(
  supabase: ReturnType<typeof createServiceClient>,
  subscription: StripeSubscription
): Promise<{ skipped: string } | { skipped: undefined }> {
  if (subscription.metadata?.type !== "firm_package_purchase") return { skipped: "not a firm package subscription" };

  await supabase
    .from("firm_package_purchases")
    .update({ status: "canceled", canceled_at: new Date().toISOString() })
    .eq("stripe_subscription_id", subscription.id);

  return { skipped: undefined };
}
