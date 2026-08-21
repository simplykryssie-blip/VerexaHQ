import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { exchangeCodeForTokens, getMicrosoftProfile } from "@/lib/calendarSync/microsoft";
import { getAppUrl } from "@/lib/appUrl";

export async function GET(request: Request) {
  const appUrl = getAppUrl(request);
  const settingsUrl = new URL("/settings/integrations", appUrl);

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", appUrl), 307);
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieStore = cookies();
  const expectedState = cookieStore.get("microsoft_calendar_oauth_state")?.value;
  cookieStore.delete("microsoft_calendar_oauth_state");

  if (!code || !state || !expectedState || state !== expectedState) {
    settingsUrl.searchParams.set("microsoft_calendar_error", "Outlook Calendar connection failed -- the request could not be verified. Try again.");
    return NextResponse.redirect(settingsUrl, 307);
  }

  const tokenResult = await exchangeCodeForTokens({ code, redirectUri: `${appUrl}/api/calendar/microsoft/callback` });
  if (!tokenResult.ok) {
    settingsUrl.searchParams.set("microsoft_calendar_error", tokenResult.reason);
    return NextResponse.redirect(settingsUrl, 307);
  }
  if (!tokenResult.data.refresh_token) {
    settingsUrl.searchParams.set("microsoft_calendar_error", "Microsoft didn't return a refresh token. Try connecting again.");
    return NextResponse.redirect(settingsUrl, 307);
  }

  const profile = await getMicrosoftProfile({ accessToken: tokenResult.data.access_token });
  if (!profile.ok) {
    settingsUrl.searchParams.set("microsoft_calendar_error", profile.reason);
    return NextResponse.redirect(settingsUrl, 307);
  }

  const serviceClient = createServiceClient();
  const [{ data: accessEncrypted }, { data: refreshEncrypted }] = await Promise.all([
    serviceClient.rpc("encrypt_calendar_secret", { p_plaintext: tokenResult.data.access_token }),
    serviceClient.rpc("encrypt_calendar_secret", { p_plaintext: tokenResult.data.refresh_token }),
  ]);

  await serviceClient.from("user_calendar_connections").upsert(
    {
      user_id: user.id,
      provider: "microsoft",
      external_account_email: profile.data.email,
      calendar_id: "primary",
      access_token_encrypted: accessEncrypted,
      refresh_token_encrypted: refreshEncrypted,
      token_expires_at: new Date(Date.now() + tokenResult.data.expires_in * 1000).toISOString(),
      refresh_token_rotated_at: new Date().toISOString(),
      status: "connected",
      connected_at: new Date().toISOString(),
    },
    { onConflict: "user_id,provider" }
  );

  settingsUrl.searchParams.set("calendar_connected", "microsoft");
  return NextResponse.redirect(settingsUrl, 307);
}
