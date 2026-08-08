import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { createAccountLink } from "@/lib/stripe/client";

export async function GET() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const fallback = new URL("/settings/integrations", appUrl);

  const workspace = await getCurrentWorkspace();
  if (!workspace) {
    return NextResponse.redirect(fallback, 307);
  }

  const supabase = createClient();
  const { data: workspaceRow } = await supabase
    .from("workspaces")
    .select("stripe_connected_account_id")
    .eq("id", workspace.id)
    .single();

  if (!workspaceRow?.stripe_connected_account_id) {
    return NextResponse.redirect(fallback, 307);
  }

  const link = await createAccountLink({
    accountId: workspaceRow.stripe_connected_account_id,
    refreshUrl: `${appUrl}/api/stripe/connect/refresh`,
    returnUrl: `${appUrl}/api/stripe/connect/return`,
  });
  if (!link.ok) {
    return NextResponse.redirect(fallback, 307);
  }

  return NextResponse.redirect(link.data.url, 307);
}
