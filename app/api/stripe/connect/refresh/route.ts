import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { deriveConnectStatus, fetchAccount } from "@/lib/stripe/client";

// account.updated is the only thing that flips stripe_charges_enabled/
// stripe_payouts_enabled after the initial connect -- if that webhook isn't
// reaching us (wrong event selected, wrong endpoint, etc.) a workspace can
// stay stuck showing "Restricted" forever even after Stripe finishes
// onboarding on their end. This re-fetches the account directly rather than
// waiting on the webhook, so status can always be manually unstuck.
export async function POST() {
  const workspace = await getCurrentWorkspace();
  if (!workspace) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const supabase = createClient();
  const { data: canManageSettings } = await supabase.rpc("has_permission", { p_workspace_id: workspace.id, p_permission_key: "settings.manage" });
  if (!canManageSettings) {
    return NextResponse.json({ error: "You don't have permission to refresh Stripe status." }, { status: 403 });
  }

  const { data: workspaceRow } = await supabase.from("workspaces").select("stripe_connected_account_id").eq("id", workspace.id).single();
  if (!workspaceRow?.stripe_connected_account_id) {
    return NextResponse.json({ error: "No Stripe account is connected." }, { status: 400 });
  }

  const account = await fetchAccount(workspaceRow.stripe_connected_account_id);
  if (!account.ok) {
    return NextResponse.json({ error: account.reason }, { status: 502 });
  }

  const status = deriveConnectStatus(account.data.charges_enabled, account.data.payouts_enabled, account.data.details_submitted);

  const { error } = await supabase
    .from("workspaces")
    .update({
      stripe_connect_status: status,
      stripe_charges_enabled: account.data.charges_enabled,
      stripe_payouts_enabled: account.data.payouts_enabled,
      stripe_details_submitted: account.data.details_submitted,
      stripe_connect_updated_at: new Date().toISOString(),
    })
    .eq("id", workspace.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, status });
}
