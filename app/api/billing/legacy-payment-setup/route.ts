import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getCurrentWorkspace } from "@/lib/workspace";
import { createCustomer, createSetupCheckoutSession } from "@/lib/stripe/client";
import { isForcedLegacySetupWorkspace } from "@/lib/billing/legacyMigrationWorkspaces";

// Self-service counterpart to /api/platform-admin/legacy-billing-migration,
// for the one named legacy workspace RequiredCardSetupScreen forces its
// owner through on every login (see lib/billing/legacyMigrationWorkspaces.ts
// for why this stays a named allowlist rather than a generic condition).
// Never charges anything itself -- it only ever creates a Stripe Customer
// and a "setup" mode Checkout Session (card collection, no charge). The
// actual Subscription (with its billing_cycle_anchor pushed out a full
// month so the payment already collected outside Verexa for the current
// period isn't double-charged) is created by handleSetupCheckoutCompleted
// once Stripe confirms the card via legacy_migration_anchor in the setup
// session's own metadata -- never here, and never before a real card is
// attached.
export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const workspace = await getCurrentWorkspace();
  if (!workspace || !isForcedLegacySetupWorkspace(workspace.id) || !workspace.is_owner) {
    return NextResponse.json({ error: "Not applicable to this workspace." }, { status: 403 });
  }

  const serviceClient = createServiceClient();
  const { data: sub } = await serviceClient
    .from("workspace_subscriptions")
    .select("stripe_customer_id, stripe_subscription_id, default_payment_method_id")
    .eq("workspace_id", workspace.id)
    .maybeSingle();

  if (!sub) {
    return NextResponse.json({ error: "This workspace has no plan assigned to check out for." }, { status: 400 });
  }
  if (sub.stripe_subscription_id) {
    return NextResponse.json({ step: "complete" });
  }

  const origin = new URL(request.url).origin;
  // A full covered month starting from whenever the card is actually
  // confirmed -- not a fixed calendar date -- since this only ever runs
  // again if the previous setup session was abandoned/expired.
  const anchor = new Date();
  anchor.setUTCMonth(anchor.getUTCMonth() + 1);
  const legacyMigrationAnchor = anchor.toISOString();

  let stripeCustomerId = sub.stripe_customer_id;
  if (!stripeCustomerId) {
    const { data: admin } = await serviceClient.rpc("get_workspace_billing_admin", { p_workspace_id: workspace.id }).maybeSingle();
    if (!admin?.email) {
      return NextResponse.json({ error: "Could not resolve a billing email for this workspace." }, { status: 400 });
    }
    const customerResult = await createCustomer({ email: admin.email, name: workspace.name, metadata: { workspace_id: workspace.id } });
    if (!customerResult.ok) {
      return NextResponse.json({ error: `Stripe customer creation failed: ${customerResult.reason}` }, { status: 502 });
    }
    // Conditional on it still being null -- if a concurrent call already
    // won this step, re-read on the client's next call instead of creating
    // a second orphan Stripe Customer referenced nowhere.
    const { data: updated } = await serviceClient
      .from("workspace_subscriptions")
      .update({ stripe_customer_id: customerResult.data.id })
      .eq("workspace_id", workspace.id)
      .is("stripe_customer_id", null)
      .select("id")
      .maybeSingle();
    stripeCustomerId = updated ? customerResult.data.id : sub.stripe_customer_id;
    if (!stripeCustomerId) {
      return NextResponse.json({ step: "processing" });
    }
  }

  if (!sub.default_payment_method_id) {
    const setupResult = await createSetupCheckoutSession({
      customerId: stripeCustomerId,
      successUrl: `${origin}/settings/plan-usage?card=added`,
      cancelUrl: `${origin}/settings/plan-usage?card=cancelled`,
      metadata: { workspace_id: workspace.id, legacy_migration_anchor: legacyMigrationAnchor },
    });
    if (!setupResult.ok) {
      return NextResponse.json({ error: `Setup Checkout Session creation failed: ${setupResult.reason}` }, { status: 502 });
    }
    return NextResponse.json({ step: "awaiting_payment_method", checkoutUrl: setupResult.data.url });
  }

  // Card is confirmed but the checkout.session.completed webhook hasn't
  // finished creating the delayed-start Subscription yet -- brief, resolves
  // on its own within seconds.
  return NextResponse.json({ step: "processing" });
}
