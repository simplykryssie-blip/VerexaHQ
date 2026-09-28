import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createSubscriptionCheckoutSessionFromPrice } from "@/lib/stripe/client";
import { isStripeConfigured } from "@/lib/providerStatus";
import { isProductionEnvironment } from "@/lib/env";
import { recordProviderCheck } from "@/lib/providerHealth";
import { checkRateLimit } from "@/lib/rateLimit";
import { getAppUrl } from "@/lib/appUrl";

// Payment-first signup: start_paid_signup already created a pending_signups
// row (no workspace -- see 20261019000000_payment_first_signup) before this
// route ever runs. This only starts Checkout against that pending signup;
// the workspace itself is created later, by handleSignupCheckoutCompleted,
// once Stripe confirms a genuinely paid subscription. This route is never
// the source of truth for activation -- it only gets the customer to
// Stripe.
//
// Distinct from /api/billing/resume-checkout: that route is for an
// already-provisioned workspace whose subscription lapsed (past_due/
// unpaid/canceled) -- a completely different request shape (an existing
// workspace_id, not a pending_signup_id) that the two routes can no longer
// share now that a brand-new signup has no workspace to key off at all.
export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const allowed = await checkRateLimit(`signup-checkout:${user.id}`, 10, 60);
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests. Try again shortly." }, { status: 429 });
  }

  const body = (await request.json().catch(() => ({}))) as { pending_signup_id?: string };
  if (!body.pending_signup_id) {
    return NextResponse.json({ error: "Missing pending signup." }, { status: 400 });
  }

  const { data: pending } = await supabase
    .from("pending_signups")
    .select("id, status, platform_subscription_plans(slug, stripe_price_id, stripe_test_price_id)")
    .eq("id", body.pending_signup_id)
    .eq("owner_user_id", user.id)
    .maybeSingle();
  if (!pending) {
    return NextResponse.json({ error: "Signup not found -- start over from the signup page." }, { status: 404 });
  }
  if (pending.status !== "pending") {
    return NextResponse.json({ error: "This signup has already been completed." }, { status: 400 });
  }

  const plan = pending.platform_subscription_plans as { slug: string; stripe_price_id: string | null; stripe_test_price_id: string | null } | null;
  if (!plan) {
    return NextResponse.json({ error: "This signup has no plan to check out for." }, { status: 400 });
  }

  // Production always checks out against the real LIVE catalog Price;
  // everywhere else (Preview, local dev) always uses the TEST-mode mirror --
  // deliberately never a fallback across the two, since a fallback either
  // direction would mean either a real customer accidentally paying against
  // a TEST Price (silently uncharged) or a test run accidentally hitting the
  // LIVE Price (a real charge). Missing means unconfigured for this
  // environment, not "use the other one" -- fail closed instead.
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
    cancelUrl: `${appUrl}/signup?checkout=cancelled`,
    metadata: { type: "signup", pending_signup_id: pending.id, plan_slug: plan.slug },
  });

  if (!result.ok) {
    await recordProviderCheck("stripe", false, result.reason);
    return NextResponse.json({ error: result.reason }, { status: 400 });
  }
  await recordProviderCheck("stripe", true);

  const { error: recordError } = await supabase.rpc("record_pending_signup_checkout_session", {
    p_pending_signup_id: pending.id,
    p_stripe_checkout_session_id: result.data.id,
  });
  if (recordError) {
    // Non-fatal for the customer -- the Checkout Session itself already
    // exists and metadata.pending_signup_id is what the webhook actually
    // relies on for provisioning. This is only a tracking convenience.
    console.error("record_pending_signup_checkout_session failed", recordError);
  }

  return NextResponse.json({ url: result.data.url });
}
