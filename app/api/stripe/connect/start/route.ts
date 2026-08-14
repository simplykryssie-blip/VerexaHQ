import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { isStripeConnectConfigured } from "@/lib/providerStatus";
import { checkRateLimit } from "@/lib/rateLimit";
import { getAppUrl } from "@/lib/appUrl";

// Standard Connect OAuth: sends the admin to Stripe's own "Connect with
// Stripe" page, where they can link an already-existing Stripe account or
// create a new one from scratch.
export async function GET(request: Request) {
  const appUrl = getAppUrl(request);
  const settingsUrl = new URL("/settings/integrations", appUrl);

  const workspace = await getCurrentWorkspace();
  if (!workspace) {
    return NextResponse.redirect(new URL("/login", appUrl), 307);
  }

  const allowed = await checkRateLimit(`stripe-connect-start:${workspace.id}`, 10, 60);
  if (!allowed) {
    settingsUrl.searchParams.set("stripe_error", "Too many requests. Try again shortly.");
    return NextResponse.redirect(settingsUrl, 307);
  }

  const supabase = createClient();
  const { data: isAdmin } = await supabase.rpc("is_workspace_admin", { p_workspace_id: workspace.id });
  if (!isAdmin) {
    settingsUrl.searchParams.set("stripe_error", "Only workspace admins can connect Stripe.");
    return NextResponse.redirect(settingsUrl, 307);
  }

  if (!isStripeConnectConfigured()) {
    settingsUrl.searchParams.set("stripe_error", "Stripe is not configured for this environment.");
    return NextResponse.redirect(settingsUrl, 307);
  }

  const state = `${crypto.randomUUID()}:${workspace.id}`;
  cookies().set("stripe_oauth_state", state, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 600, path: "/" });

  const authorizeUrl = new URL("https://connect.stripe.com/oauth/authorize");
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("client_id", process.env.STRIPE_CONNECT_CLIENT_ID!);
  authorizeUrl.searchParams.set("scope", "read_write");
  authorizeUrl.searchParams.set("redirect_uri", `${appUrl}/api/stripe/connect/callback`);
  authorizeUrl.searchParams.set("state", state);

  return NextResponse.redirect(authorizeUrl, 307);
}
