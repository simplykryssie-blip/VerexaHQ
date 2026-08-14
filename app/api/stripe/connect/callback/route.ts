import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { deriveConnectStatus, exchangeOAuthCode, fetchAccount } from "@/lib/stripe/client";
import { getAppUrl } from "@/lib/appUrl";

export async function GET(request: Request) {
  const appUrl = getAppUrl(request);
  const settingsUrl = new URL("/settings/integrations", appUrl);
  const url = new URL(request.url);

  const oauthError = url.searchParams.get("error_description") ?? url.searchParams.get("error");
  if (oauthError) {
    settingsUrl.searchParams.set("stripe_error", oauthError);
    return NextResponse.redirect(settingsUrl, 307);
  }

  const code = url.searchParams.get("code");
  const returnedState = url.searchParams.get("state");
  const cookieStore = cookies();
  const savedState = cookieStore.get("stripe_oauth_state")?.value;
  cookieStore.delete("stripe_oauth_state");

  if (!code || !returnedState || !savedState || returnedState !== savedState) {
    settingsUrl.searchParams.set("stripe_error", "Stripe connection could not be verified -- try again.");
    return NextResponse.redirect(settingsUrl, 307);
  }

  const [, workspaceId] = savedState.split(":");
  if (!workspaceId) {
    settingsUrl.searchParams.set("stripe_error", "Stripe connection could not be verified -- try again.");
    return NextResponse.redirect(settingsUrl, 307);
  }

  const exchanged = await exchangeOAuthCode(code);
  if (!exchanged.ok) {
    settingsUrl.searchParams.set("stripe_error", exchanged.reason);
    return NextResponse.redirect(settingsUrl, 307);
  }

  const supabase = createClient();
  const account = await fetchAccount(exchanged.data.stripeUserId);
  const status = account.ok ? deriveConnectStatus(account.data.charges_enabled, account.data.payouts_enabled, account.data.details_submitted) : "pending";

  const { error } = await supabase
    .from("workspaces")
    .update({
      stripe_connected_account_id: exchanged.data.stripeUserId,
      stripe_connect_account_type: "standard",
      stripe_connect_status: status,
      stripe_charges_enabled: account.ok ? account.data.charges_enabled : false,
      stripe_payouts_enabled: account.ok ? account.data.payouts_enabled : false,
      stripe_details_submitted: account.ok ? account.data.details_submitted : false,
      stripe_connect_updated_at: new Date().toISOString(),
    })
    .eq("id", workspaceId);

  if (error) {
    settingsUrl.searchParams.set("stripe_error", error.message);
    return NextResponse.redirect(settingsUrl, 307);
  }

  settingsUrl.searchParams.set("stripe_connected", "1");
  return NextResponse.redirect(settingsUrl, 307);
}
