import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createSubscriptionCheckoutSessionFromPrice } from "@/lib/stripe/client";
import { isStripeConfigured } from "@/lib/providerStatus";
import { isProductionEnvironment } from "@/lib/env";
import { recordProviderCheck } from "@/lib/providerHealth";
import { checkRateLimit } from "@/lib/rateLimit";
import { getCurrentWorkspace } from "@/lib/workspace";
import { getAppUrl } from "@/lib/appUrl";
import { needsCheckoutResume } from "@/lib/stripe/checkoutEligibility";

// Existing-customer billing recovery: an already-provisioned workspace
// whose subscription has lapsed (past_due/unpaid/canceled -- via the
// billing-cycle dunning cron or Stripe's own retries) starts a fresh
// Checkout Session against its own existing workspace_subscriptions row.
//
// This used to live at /api/signup/checkout, back when that route also
// handled a brand-new signup's first checkout for an already-created
// (billing_incomplete) workspace. Payment-first signup
// (20261019000000_payment_first_signup) removed that case entirely -- a
// brand-new signup has no workspace until Checkout succeeds -- so the two
// concepts no longer share one request shape (an existing workspace vs. a
// pending_signup_id) and were split into separate routes. This route keeps
// the "billing_past_due" (and similar) recovery path from PR #275 working
// exactly as before for genuinely existing customers.
export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const allowed = await checkRateLimit(`resume-checkout:${user.id}`, 10, 60);
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests. Try again shortly." }, { status: 429 });
  }

  const workspace = await getCurrentWorkspace();
  if (!workspace) {
    return NextResponse.json({ error: "No workspace to check out for." }, { status: 400 });
  }

  const { data: subscription } = await supabase
    .from("workspace_subscriptions")
    .select("stripe_status, platform_subscription_plans(slug, stripe_price_id, stripe_test_price_id)")
    .eq("workspace_id", workspace.id)
    .maybeSingle();
  const plan = subscription?.platform_subscription_plans as { slug: string; stripe_price_id: string | null; stripe_test_price_id: string | null } | null;
  if (!subscription || !plan) {
    return NextResponse.json({ error: "This workspace has no plan to check out for." }, { status: 400 });
  }
  if (!needsCheckoutResume(workspace.status, subscription.stripe_status)) {
    return NextResponse.json({ error: "This workspace already has an active subscription." }, { status: 400 });
  }

  const priceId = isProductionEnvironment() ? plan.stripe_price_id : plan.stripe_test_price_id;
  if (!priceId) {
    return NextResponse.json(
      {
        error: isProductionEnvironment()
          ? "This plan isn't available for checkout yet -- contact Verexa support."
          : "This plan has no TEST-mode Stripe price configured for this environment.",
      },
      { status: 503 }
    );
  }

  if (!isStripeConfigured()) {
    return NextResponse.json({ error: "Stripe is not configured for this environment." }, { status: 503 });
  }

  const appUrl = getAppUrl(request);
  const result = await createSubscriptionCheckoutSessionFromPrice({
    priceId,
    successUrl: `${appUrl}/dashboard?signup=complete`,
    cancelUrl: `${appUrl}/settings/plan-usage?checkout=cancelled`,
    metadata: { type: "resume", workspace_id: workspace.id, plan_slug: plan.slug },
  });

  if (!result.ok) {
    await recordProviderCheck("stripe", false, result.reason);
    return NextResponse.json({ error: result.reason }, { status: 400 });
  }
  await recordProviderCheck("stripe", true);

  return NextResponse.json({ url: result.data.url });
}
