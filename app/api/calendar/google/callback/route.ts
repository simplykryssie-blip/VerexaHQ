import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { exchangeCodeForTokens, getGoogleProfile } from "@/lib/calendarSync/google";
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
  const expectedState = cookieStore.get("google_calendar_oauth_state")?.value;
  cookieStore.delete("google_calendar_oauth_state");

  if (!code || !state || !expectedState || state !== expectedState) {
    settingsUrl.searchParams.set("google_calendar_error", "Google Calendar connection failed -- the request could not be verified. Try again.");
    return NextResponse.redirect(settingsUrl, 307);
  }

  const tokenResult = await exchangeCodeForTokens({ code, redirectUri: `${appUrl}/api/calendar/google/callback` });
  if (!tokenResult.ok) {
    settingsUrl.searchParams.set("google_calendar_error", tokenResult.reason);
    return NextResponse.redirect(settingsUrl, 307);
  }
  if (!tokenResult.data.refresh_token) {
    // Happens when the user has already granted this app consent before and
    // Google skips re-issuing a refresh token -- prompt=consent above should
    // prevent this, but if it ever does happen there's nothing to persist.
    settingsUrl.searchParams.set("google_calendar_error", "Google didn't return a refresh token. Revoke Verexa's access in your Google Account and try again.");
    return NextResponse.redirect(settingsUrl, 307);
  }

  const profile = await getGoogleProfile({ accessToken: tokenResult.data.access_token });
  if (!profile.ok) {
    settingsUrl.searchParams.set("google_calendar_error", profile.reason);
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
      provider: "google",
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

  settingsUrl.searchParams.set("calendar_connected", "google");
  return NextResponse.redirect(settingsUrl, 307);
}
