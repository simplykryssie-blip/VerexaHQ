import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace, workspaceOperationalError, isWorkspaceStatusOperational } from "@/lib/workspace";
import { createCheckoutSession, createSubscriptionCheckoutSession } from "@/lib/stripe/client";
import { getWorkspaceConnectAccount } from "@/lib/stripe/workspaceConnect";
import { isStripeConfigured } from "@/lib/providerStatus";
import { recordProviderCheck } from "@/lib/providerHealth";
import { checkRateLimit } from "@/lib/rateLimit";
import { getAppUrl } from "@/lib/appUrl";

// Generic Product-model checkout: a workspace's own client buying one of
// its Service/Digital Product listings directly -- "Workspace -> Payment
// Integration -> Stripe Account -> Products/Prices/Checkout/Payments" with
// no Firm Connection involved (see /api/firm-packages/checkout for the
// connection-scoped case, which this deliberately does not replace).
// Reuses the same ad-hoc price_data Checkout Session pattern (no Stripe
// Price ID ever entered by hand) and the same handleFirmPackagePurchaseCheckoutCompleted
// webhook handler, keyed by purchase_id metadata exactly like that route --
// the handler itself doesn't care whether the buyer is a connection, an
// external partner prospect, or (this route) a plain client.
export async function POST(request: Request) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (!isWorkspaceStatusOperational(workspace.status)) {
    return NextResponse.json({ error: workspaceOperationalError(workspace) }, { status: 403 });
  }

  const allowed = await checkRateLimit(`product-checkout:${workspace.id}`, 10, 60);
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests. Try again shortly." }, { status: 429 });
  }

  const body = (await request.json()) as { productId?: string; clientId?: string };
  const productId = body.productId;
  const clientId = body.clientId;
  if (!productId || !clientId) {
    return NextResponse.json({ error: "productId and clientId are required" }, { status: 400 });
  }

  if (!isStripeConfigured()) {
    return NextResponse.json({ configured: false, reason: "Stripe is not configured for this environment." }, { status: 200 });
  }

  const supabase = createClient();

  // Scoped to this workspace's OWN products -- selling a connected firm's
  // package to its own client is the connection-based route's job, not
  // this one.
  const { data: product, error: productError } = await supabase
    .from("firm_packages")
    .select("id, workspace_id, provider_workspace_id, name, product_type, flat_price, billing_cadence, status")
    .eq("id", productId)
    .eq("workspace_id", workspace.id)
    .single();
  if (productError || !product) {
    return NextResponse.json({ error: productError?.message ?? "Product not found" }, { status: 404 });
  }
  if (product.product_type === "package") {
    return NextResponse.json({ error: "Packages are sold to connected firms -- use the firm connection checkout instead." }, { status: 400 });
  }
  if (product.status !== "published") {
    return NextResponse.json({ error: "This product is not currently available for purchase." }, { status: 400 });
  }
  if (!product.flat_price || product.flat_price <= 0) {
    return NextResponse.json({ error: "This product has no price set yet." }, { status: 400 });
  }

  const { data: client, error: clientError } = await supabase.from("clients").select("id").eq("id", clientId).eq("workspace_id", workspace.id).single();
  if (clientError || !client) {
    return NextResponse.json({ error: clientError?.message ?? "Client not found" }, { status: 404 });
  }

  const providerWorkspaceId = product.provider_workspace_id ?? product.workspace_id;

  // The purchasing workspace's own suspension is already checked above; this
  // covers the other half (Phase 4A) -- the selling (or reselling) firm's own
  // workspace can be suspended independently, and nothing else in this route
  // ever looks at it, so a suspended firm could otherwise keep collecting
  // product sales. Mirrors /api/firm-packages/checkout's same check.
  const { data: sellerOperational } = await supabase.rpc("is_workspace_operational", { p_workspace_id: providerWorkspaceId });
  if (!sellerOperational) {
    return NextResponse.json({ error: "This product is temporarily unavailable for purchase." }, { status: 403 });
  }

  const connectAccount = await getWorkspaceConnectAccount(supabase, providerWorkspaceId);
  if (!connectAccount.ok) {
    return NextResponse.json({ configured: false, reason: connectAccount.reason }, { status: 200 });
  }

  const { data: purchase, error: purchaseError } = await supabase
    .from("firm_package_purchases")
    .insert({
      package_id: product.id,
      client_id: client.id,
      workspace_id: workspace.id,
      parent_workspace_id: providerWorkspaceId,
      status: "pending",
      billing_cadence: product.billing_cadence,
      amount: product.flat_price,
      currency: "usd",
      source: "in_app",
    })
    .select("id")
    .single();
  if (purchaseError || !purchase) {
    const message = purchaseError?.message.includes("firm_package_purchases_active_per_client")
      ? "This client already has a purchase in progress or active for this product."
      : (purchaseError?.message ?? "Could not start checkout.");
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const appUrl = getAppUrl(request);
  const isRecurring = product.billing_cadence === "monthly" || product.billing_cadence === "annual";
  const result = isRecurring
    ? await createSubscriptionCheckoutSession({
        amount: product.flat_price,
        description: product.name,
        interval: product.billing_cadence === "annual" ? "year" : "month",
        successUrl: `${appUrl}/clients/${client.id}?purchase=1`,
        cancelUrl: `${appUrl}/clients/${client.id}?purchase=0`,
        metadata: { type: "firm_package_purchase", purchase_id: purchase.id },
        connectedAccountId: connectAccount.accountId,
      })
    : await createCheckoutSession({
        amount: product.flat_price,
        description: product.name,
        successUrl: `${appUrl}/clients/${client.id}?purchase=1`,
        cancelUrl: `${appUrl}/clients/${client.id}?purchase=0`,
        metadata: { type: "firm_package_purchase", purchase_id: purchase.id },
        connectedAccountId: connectAccount.accountId,
      });

  if (!result.ok) {
    await supabase.from("firm_package_purchases").delete().eq("id", purchase.id);
    if (result.reason !== "Stripe is not configured for this environment.") {
      await recordProviderCheck("stripe", false, result.reason);
    }
    return NextResponse.json({ configured: false, reason: result.reason }, { status: 200 });
  }
  await recordProviderCheck("stripe", true);

  await supabase.from("firm_package_purchases").update({ stripe_checkout_session_id: result.data.id }).eq("id", purchase.id);

  return NextResponse.json({ configured: true, url: result.data.url });
}
