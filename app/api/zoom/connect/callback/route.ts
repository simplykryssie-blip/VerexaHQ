import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { exchangeCodeForTokens, getZoomProfile } from "@/lib/zoom/client";

export async function GET(request: Request) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const settingsUrl = new URL("/settings/my-account", appUrl);

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
  const expectedState = cookieStore.get("zoom_oauth_state")?.value;
  cookieStore.delete("zoom_oauth_state");

  if (!code || !state || !expectedState || state !== expectedState) {
    settingsUrl.searchParams.set("zoom_error", "Zoom connection failed -- the request could not be verified. Try again.");
    return NextResponse.redirect(settingsUrl, 307);
  }

  const tokenResult = await exchangeCodeForTokens({ code, redirectUri: `${appUrl}/api/zoom/connect/callback` });
  if (!tokenResult.ok) {
    settingsUrl.searchParams.set("zoom_error", tokenResult.reason);
    return NextResponse.redirect(settingsUrl, 307);
  }

  const profile = await getZoomProfile({ accessToken: tokenResult.data.access_token });
  if (!profile.ok) {
    settingsUrl.searchParams.set("zoom_error", profile.reason);
    return NextResponse.redirect(settingsUrl, 307);
  }

  const serviceClient = createServiceClient();
  const [{ data: accessEncrypted }, { data: refreshEncrypted }] = await Promise.all([
    serviceClient.rpc("encrypt_zoom_secret", { p_plaintext: tokenResult.data.access_token }),
    serviceClient.rpc("encrypt_zoom_secret", { p_plaintext: tokenResult.data.refresh_token }),
  ]);

  await serviceClient.from("user_zoom_connections").upsert(
    {
      user_id: user.id,
      zoom_user_id: profile.data.id,
      zoom_email: profile.data.email,
      access_token_encrypted: accessEncrypted,
      refresh_token_encrypted: refreshEncrypted,
      token_expires_at: new Date(Date.now() + tokenResult.data.expires_in * 1000).toISOString(),
      refresh_token_rotated_at: new Date().toISOString(),
      status: "connected",
      connected_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  settingsUrl.searchParams.set("zoom_connected", "1");
  return NextResponse.redirect(settingsUrl, 307);
}
