import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { deauthorizeOAuthAccount } from "@/lib/stripe/client";

export async function POST() {
  const workspace = await getCurrentWorkspace();
  if (!workspace) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const supabase = createClient();
  const { data: canManageSettings } = await supabase.rpc("has_permission", { p_workspace_id: workspace.id, p_permission_key: "settings.manage" });
  if (!canManageSettings) {
    return NextResponse.json({ error: "You don't have permission to disconnect Stripe." }, { status: 403 });
  }

  const { data: workspaceRow } = await supabase.from("workspaces").select("stripe_connected_account_id").eq("id", workspace.id).single();
  if (workspaceRow?.stripe_connected_account_id) {
    const result = await deauthorizeOAuthAccount(workspaceRow.stripe_connected_account_id);
    if (!result.ok) {
      return NextResponse.json({ error: result.reason }, { status: 502 });
    }
  }

  const { error } = await supabase
    .from("workspaces")
    .update({
      stripe_connected_account_id: null,
      stripe_connect_account_type: null,
      stripe_connect_status: "not_connected",
      stripe_charges_enabled: false,
      stripe_payouts_enabled: false,
      stripe_details_submitted: false,
      stripe_connect_updated_at: new Date().toISOString(),
    })
    .eq("id", workspace.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
