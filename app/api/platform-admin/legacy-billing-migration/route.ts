import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isProductionEnvironment } from "@/lib/env";
import { createCustomer, createSetupCheckoutSession, createDelayedStartSubscription } from "@/lib/stripe/client";

/**
 * One-off, platform-admin-only tool for migrating a pre-existing workspace
 * (one that predates payment-first signup and has never had a real Stripe
 * Customer or Subscription) onto real Stripe billing, with its first charge
 * guaranteed not to happen before an exact, contractually-agreed future
 * date. Built for exactly two legacy customers -- Doucet Financial Group
 * and MCJ Consulting LLC -- but takes workspaceId/billingCycleAnchor as
 * request parameters rather than hardcoding either, so no customer-specific
 * identifier lives in this file any more than in the generic billing code
 * it calls.
 *
 * Never creates a workspace, a duplicate Stripe Customer, or a duplicate
 * Subscription: every step is driven by what's already on the existing
 * workspace_subscriptions row, and this can be called repeatedly (once
 * after the customer completes the setup Checkout, for instance) --
 * calling it again just re-reads state and returns the next step, or
 * "already_migrated" once a real subscription exists. See
 * createDelayedStartSubscription in lib/stripe/client.ts for why
 * billing_cycle_anchor + proration_behavior "none" is the mechanism that
 * guarantees zero charge before the anchor date.
 */
export async function POST(request: Request) {
  const supabase = createClient();
  const { data: isPlatformAdmin } = await supabase.rpc("is_platform_admin");
  if (!isPlatformAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const workspaceId = typeof body?.workspaceId === "string" ? body.workspaceId : "";
  const billingCycleAnchor = typeof body?.billingCycleAnchor === "string" ? body.billingCycleAnchor : "";

  if (!workspaceId || !billingCycleAnchor) {
    return NextResponse.json({ error: "workspaceId and billingCycleAnchor (YYYY-MM-DD) are required" }, { status: 400 });
  }

  const anchorDate = new Date(`${billingCycleAnchor}T00:00:00Z`);
  if (Number.isNaN(anchorDate.getTime()) || anchorDate.getTime() <= Date.now()) {
    return NextResponse.json({ error: "billingCycleAnchor must be a valid future date (YYYY-MM-DD)" }, { status: 400 });
  }
  const anchorIso = anchorDate.toISOString();
  const anchorUnix = Math.floor(anchorDate.getTime() / 1000);

  const origin = new URL(request.url).origin;
  const serviceClient = createServiceClient();

  const { data: workspace } = await serviceClient.from("workspaces").select("id, name, is_billing_exempt").eq("id", workspaceId).maybeSingle();
  if (!workspace) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }
  if (workspace.is_billing_exempt) {
    return NextResponse.json({ error: "This workspace is billing-exempt and cannot be migrated onto paid billing." }, { status: 400 });
  }

  const { data: sub } = await serviceClient
    .from("workspace_subscriptions")
    .select("id, plan_id, stripe_customer_id, stripe_subscription_id, default_payment_method_id, first_period_end, platform_subscription_plans(stripe_price_id, stripe_test_price_id)")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (!sub) {
    return NextResponse.json({ error: "This workspace has no existing subscription row to migrate -- it must already have a plan assigned." }, { status: 400 });
  }

  // Already fully migrated: nothing further to do, regardless of how many
  // times this is called.
  if (sub.stripe_subscription_id) {
    return NextResponse.json({
      step: "already_migrated",
      stripeCustomerId: sub.stripe_customer_id,
      stripeSubscriptionId: sub.stripe_subscription_id,
      firstPeriodEnd: sub.first_period_end,
    });
  }

  // Step 1: no Stripe Customer yet -- create one and generate the setup
  // Checkout link for the real customer to add their real card.
  if (!sub.stripe_customer_id) {
    const { data: admin } = await serviceClient.rpc("get_workspace_billing_admin", { p_workspace_id: workspaceId }).maybeSingle();
    if (!admin?.email) {
      return NextResponse.json({ error: "Could not resolve a billing admin/email for this workspace" }, { status: 400 });
    }

    const customerResult = await createCustomer({
      email: admin.email,
      name: workspace.name,
      metadata: { workspace_id: workspaceId },
    });
    if (!customerResult.ok) {
      return NextResponse.json({ error: `Stripe customer creation failed: ${customerResult.reason}` }, { status: 502 });
    }

    // Conditional on stripe_customer_id still being null -- if a concurrent
    // call already won this step, don't leave an orphan Customer referenced
    // nowhere; the caller re-reads current state on its next call instead.
    const { data: updated } = await serviceClient
      .from("workspace_subscriptions")
      .update({ stripe_customer_id: customerResult.data.id })
      .eq("workspace_id", workspaceId)
      .is("stripe_customer_id", null)
      .select("id")
      .maybeSingle();
    if (!updated) {
      return NextResponse.json({ error: "Another migration call already created a Stripe customer for this workspace -- retry to pick up its state." }, { status: 409 });
    }

    const setupResult = await createSetupCheckoutSession({
      customerId: customerResult.data.id,
      successUrl: `${origin}/settings/plan-usage?card=added`,
      cancelUrl: `${origin}/settings/plan-usage?card=cancelled`,
      metadata: { workspace_id: workspaceId },
    });
    if (!setupResult.ok) {
      return NextResponse.json({ error: `Setup Checkout Session creation failed: ${setupResult.reason}` }, { status: 502 });
    }

    return NextResponse.json({ step: "awaiting_payment_method", stripeCustomerId: customerResult.data.id, checkoutUrl: setupResult.data.url });
  }

  // Step 2: Customer exists but no payment method confirmed yet (the
  // customer hasn't completed the setup Checkout, or it expired) -- issue a
  // fresh setup Checkout link. Safe to call repeatedly: Checkout Sessions
  // are single-use/expiring, never a "duplicate subscription" risk.
  if (!sub.default_payment_method_id) {
    const setupResult = await createSetupCheckoutSession({
      customerId: sub.stripe_customer_id,
      successUrl: `${origin}/settings/plan-usage?card=added`,
      cancelUrl: `${origin}/settings/plan-usage?card=cancelled`,
      metadata: { workspace_id: workspaceId },
    });
    if (!setupResult.ok) {
      return NextResponse.json({ error: `Setup Checkout Session creation failed: ${setupResult.reason}` }, { status: 502 });
    }
    return NextResponse.json({ step: "awaiting_payment_method", stripeCustomerId: sub.stripe_customer_id, checkoutUrl: setupResult.data.url });
  }

  // Step 3: payment method confirmed, no subscription yet -- create the
  // real, delayed-start Subscription. This is the only step in this route
  // that ever creates a Subscription, and it's gated on default_payment_method_id
  // being non-null, which only becomes true after handleSetupCheckoutCompleted
  // has actually recorded a real attached card -- never before.
  const plan = sub.platform_subscription_plans as { stripe_price_id: string | null; stripe_test_price_id: string | null } | null;
  const priceId = isProductionEnvironment() ? plan?.stripe_price_id : plan?.stripe_test_price_id;
  if (!priceId) {
    return NextResponse.json({ error: "This workspace's plan has no Stripe price configured for this environment." }, { status: 400 });
  }

  const subscriptionResult = await createDelayedStartSubscription({
    customerId: sub.stripe_customer_id,
    priceId,
    billingCycleAnchorUnix: anchorUnix,
    defaultPaymentMethodId: sub.default_payment_method_id,
    metadata: { workspace_id: workspaceId, first_period_end: billingCycleAnchor },
  });
  if (!subscriptionResult.ok) {
    return NextResponse.json({ error: `Subscription creation failed: ${subscriptionResult.reason}` }, { status: 502 });
  }

  // The authoritative marker for the dunning cron -- set directly here
  // rather than waiting on the customer.subscription.created webhook, and
  // scoped to this one column so it never races with that webhook's own
  // upsert (which never touches first_period_end).
  await serviceClient.from("workspace_subscriptions").update({ first_period_end: anchorIso }).eq("workspace_id", workspaceId);

  return NextResponse.json({
    step: "subscription_created",
    stripeCustomerId: sub.stripe_customer_id,
    stripeSubscriptionId: subscriptionResult.data.id,
    firstChargeDate: billingCycleAnchor,
  });
}
