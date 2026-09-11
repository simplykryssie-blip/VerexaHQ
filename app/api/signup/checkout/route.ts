import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createSubscriptionCheckoutSession } from "@/lib/stripe/client";
import { isStripeConfigured } from "@/lib/providerStatus";
import { recordProviderCheck } from "@/lib/providerHealth";
import { checkRateLimit } from "@/lib/rateLimit";
import { getCurrentWorkspace } from "@/lib/workspace";
import { getAppUrl } from "@/lib/appUrl";

// Card is required at signup -- create_paid_workspace already created the
// workspace plus a workspace_subscriptions row defaulted to 'incomplete'
// (see its migration); this is the step right after that gets a real
// subscription started. handleSubscriptionCreated (the existing
// customer.subscription.created webhook) is what actually flips the row to
// 'active' once Stripe confirms the card, matched back to this workspace
// via the metadata set below -- nothing here writes to the database itself.
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

  const workspace = await getCurrentWorkspace();
  if (!workspace) {
    return NextResponse.json({ error: "No workspace to check out for -- finish creating your account first." }, { status: 400 });
  }

  const { data: subscription } = await supabase
    .from("workspace_subscriptions")
    .select("stripe_status, platform_subscription_plans(slug, name, base_price_cents)")
    .eq("workspace_id", workspace.id)
    .maybeSingle();
  const plan = subscription?.platform_subscription_plans as { slug: string; name: string; base_price_cents: number } | null;
  if (!subscription || !plan) {
    return NextResponse.json({ error: "This workspace has no plan to check out for." }, { status: 400 });
  }
  if (subscription.stripe_status === "active") {
    return NextResponse.json({ error: "This workspace already has an active subscription." }, { status: 400 });
  }

  if (!isStripeConfigured()) {
    return NextResponse.json({ error: "Stripe is not configured for this environment." }, { status: 503 });
  }

  const appUrl = getAppUrl(request);
  const result = await createSubscriptionCheckoutSession({
    amount: plan.base_price_cents / 100,
    interval: "month",
    description: `Verexa ${plan.name} plan`,
    successUrl: `${appUrl}/dashboard?signup=complete`,
    cancelUrl: `${appUrl}/signup?checkout=cancelled`,
    metadata: { type: "signup", workspace_id: workspace.id, plan_slug: plan.slug },
  });

  if (!result.ok) {
    await recordProviderCheck("stripe", false, result.reason);
    return NextResponse.json({ error: result.reason }, { status: 400 });
  }
  await recordProviderCheck("stripe", true);

  return NextResponse.json({ url: result.data.url });
}
