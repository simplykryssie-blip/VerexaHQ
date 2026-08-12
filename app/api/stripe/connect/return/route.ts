import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { deriveConnectStatus, fetchAccount } from "@/lib/stripe/client";
import { getAppUrl } from "@/lib/appUrl";

export async function GET(request: Request) {
  const appUrl = getAppUrl(request);
  const redirectTo = new URL("/settings/integrations", appUrl);

  const workspace = await getCurrentWorkspace();
  if (!workspace) {
    return NextResponse.redirect(redirectTo, 307);
  }

  const supabase = createClient();
  const { data: workspaceRow } = await supabase
    .from("workspaces")
    .select("stripe_connected_account_id")
    .eq("id", workspace.id)
    .single();

  if (workspaceRow?.stripe_connected_account_id) {
    const account = await fetchAccount(workspaceRow.stripe_connected_account_id);
    if (account.ok) {
      const status = deriveConnectStatus(account.data.charges_enabled, account.data.payouts_enabled, account.data.details_submitted);
      await supabase
        .from("workspaces")
        .update({
          stripe_charges_enabled: account.data.charges_enabled,
          stripe_payouts_enabled: account.data.payouts_enabled,
          stripe_details_submitted: account.data.details_submitted,
          stripe_connect_status: status,
          stripe_connect_updated_at: new Date().toISOString(),
        })
        .eq("id", workspace.id);
    }
  }

  return NextResponse.redirect(redirectTo, 307);
}
