import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { createCheckoutSession, createSubscriptionCheckoutSession } from "@/lib/stripe/client";
import { getWorkspaceConnectAccount } from "@/lib/stripe/workspaceConnect";
import { isStripeConfigured } from "@/lib/providerStatus";
import { recordProviderCheck } from "@/lib/providerHealth";
import { checkRateLimit } from "@/lib/rateLimit";
import { getAppUrl } from "@/lib/appUrl";

export async function POST(request: Request) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const allowed = await checkRateLimit(`firm-package-checkout:${workspace.id}`, 10, 60);
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests. Try again shortly." }, { status: 429 });
  }

  const body = (await request.json()) as { connectionId?: string; selectedOptionIds?: string[] };
  const connectionId = body.connectionId;
  const selectedOptionIds = body.selectedOptionIds ?? [];
  if (!connectionId) {
    return NextResponse.json({ error: "connectionId is required" }, { status: 400 });
  }

  if (!isStripeConfigured()) {
    return NextResponse.json({ configured: false, reason: "Stripe is not configured for this environment." }, { status: 200 });
  }

  const supabase = createClient();

  const { data: connection, error: connectionError } = await supabase
    .from("firm_connections")
    .select("id, child_workspace_id, package_id, status")
    .eq("id", connectionId)
    .eq("child_workspace_id", workspace.id)
    .single();
  if (connectionError || !connection) {
    return NextResponse.json({ error: connectionError?.message ?? "Connection not found" }, { status: 404 });
  }
  if (connection.status !== "active" || !connection.package_id) {
    return NextResponse.json({ error: "No package is assigned to this connection yet." }, { status: 400 });
  }

  const { data: pkg, error: pkgError } = await supabase
    .from("firm_packages")
    .select("id, workspace_id, name, flat_price, billing_cadence")
    .eq("id", connection.package_id)
    .single();
  if (pkgError || !pkg) {
    return NextResponse.json({ error: pkgError?.message ?? "Package not found" }, { status: 404 });
  }
  if (!pkg.flat_price || pkg.flat_price <= 0) {
    return NextResponse.json({ error: "This package has no price set yet -- ask your ERO to set one." }, { status: 400 });
  }

  const { data: groups } = await supabase
    .from("firm_package_option_groups")
    .select("id, name, min_select, max_select, firm_package_options(id)")
    .eq("package_id", pkg.id);

  const allOptionIds = new Set((groups ?? []).flatMap((g) => (g.firm_package_options as { id: string }[]).map((o) => o.id)));
  for (const id of selectedOptionIds) {
    if (!allOptionIds.has(id)) {
      return NextResponse.json({ error: "One of the selected options doesn't belong to this package." }, { status: 400 });
    }
  }
  for (const group of groups ?? []) {
    const groupOptionIds = new Set((group.firm_package_options as { id: string }[]).map((o) => o.id));
    const selectedInGroup = selectedOptionIds.filter((id) => groupOptionIds.has(id)).length;
    if (selectedInGroup < group.min_select) {
      return NextResponse.json({ error: `Choose at least ${group.min_select} option(s) for "${group.name}".` }, { status: 400 });
    }
    if (group.max_select != null && selectedInGroup > group.max_select) {
      return NextResponse.json({ error: `Choose at most ${group.max_select} option(s) for "${group.name}".` }, { status: 400 });
    }
  }

  const connectAccount = await getWorkspaceConnectAccount(supabase, pkg.workspace_id);
  if (!connectAccount.ok) {
    return NextResponse.json({ configured: false, reason: connectAccount.reason }, { status: 200 });
  }

  const { data: purchase, error: purchaseError } = await supabase
    .from("firm_package_purchases")
    .insert({
      package_id: pkg.id,
      connection_id: connection.id,
      workspace_id: workspace.id,
      parent_workspace_id: pkg.workspace_id,
      status: "pending",
      billing_cadence: pkg.billing_cadence,
      amount: pkg.flat_price,
      selected_option_ids: selectedOptionIds,
    })
    .select("id")
    .single();
  if (purchaseError || !purchase) {
    const message = purchaseError?.message.includes("firm_package_purchases_active_per_connection")
      ? "You already have a purchase in progress or active for this package."
      : (purchaseError?.message ?? "Could not start checkout.");
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const appUrl = getAppUrl(request);
  const isRecurring = pkg.billing_cadence === "monthly" || pkg.billing_cadence === "annual";
  const result = isRecurring
    ? await createSubscriptionCheckoutSession({
        amount: pkg.flat_price,
        description: pkg.name,
        interval: pkg.billing_cadence === "annual" ? "year" : "month",
        successUrl: `${appUrl}/settings/firm-profile?purchase=1`,
        cancelUrl: `${appUrl}/settings/firm-profile?purchase=0`,
        metadata: { type: "firm_package_purchase", purchase_id: purchase.id },
        connectedAccountId: connectAccount.accountId,
      })
    : await createCheckoutSession({
        amount: pkg.flat_price,
        description: pkg.name,
        successUrl: `${appUrl}/settings/firm-profile?purchase=1`,
        cancelUrl: `${appUrl}/settings/firm-profile?purchase=0`,
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
