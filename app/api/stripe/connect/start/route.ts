import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { createAccountLink, createConnectedAccount } from "@/lib/stripe/client";
import { isStripeConfigured } from "@/lib/providerStatus";
import { checkRateLimit } from "@/lib/rateLimit";

export async function POST() {
  const workspace = await getCurrentWorkspace();
  if (!workspace) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const allowed = await checkRateLimit(`stripe-connect-start:${workspace.id}`, 10, 60);
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests. Try again shortly." }, { status: 429 });
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: isAdmin } = await supabase.rpc("is_workspace_admin", { p_workspace_id: workspace.id });
  if (!isAdmin) {
    return NextResponse.json({ error: "Only workspace admins can connect Stripe." }, { status: 403 });
  }

  if (!isStripeConfigured()) {
    return NextResponse.json({ configured: false, reason: "Stripe is not configured for this environment." }, { status: 200 });
  }

  const { data: workspaceRow, error: workspaceError } = await supabase
    .from("workspaces")
    .select("stripe_connected_account_id")
    .eq("id", workspace.id)
    .single();
  if (workspaceError || !workspaceRow) {
    return NextResponse.json({ error: workspaceError?.message ?? "Workspace not found" }, { status: 404 });
  }

  let accountId = workspaceRow.stripe_connected_account_id;
  if (!accountId) {
    const created = await createConnectedAccount({ email: user?.email, workspaceId: workspace.id });
    if (!created.ok) {
      return NextResponse.json({ configured: false, reason: created.reason }, { status: 200 });
    }
    accountId = created.data.id;
    await supabase
      .from("workspaces")
      .update({
        stripe_connected_account_id: accountId,
        stripe_connect_account_type: "standard",
        stripe_connect_status: "pending",
        stripe_connect_updated_at: new Date().toISOString(),
      })
      .eq("id", workspace.id);
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const link = await createAccountLink({
    accountId,
    refreshUrl: `${appUrl}/api/stripe/connect/refresh`,
    returnUrl: `${appUrl}/api/stripe/connect/return`,
  });
  if (!link.ok) {
    return NextResponse.json({ configured: false, reason: link.reason }, { status: 200 });
  }

  return NextResponse.json({ configured: true, url: link.data.url });
}
