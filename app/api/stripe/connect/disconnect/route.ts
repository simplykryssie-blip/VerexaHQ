import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { deauthorizeOAuthAccount } from "@/lib/stripe/client";
import { hasAal2, AAL2_REQUIRED_RESPONSE_BODY, AAL2_REQUIRED_STATUS } from "@/lib/auth/requireAal2";

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

  // VEREXA-AAL-001: disconnecting Stripe disrupts this workspace's payouts
  // -- a password-only session must not be sufficient on its own.
  if (!(await hasAal2(supabase))) {
    return NextResponse.json(AAL2_REQUIRED_RESPONSE_BODY, { status: AAL2_REQUIRED_STATUS });
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
