import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getAuthorizationUrl } from "@/lib/zoom/client";
import { isZoomConfigured } from "@/lib/providerStatus";
import { getAppUrl } from "@/lib/appUrl";

export async function GET(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const appUrl = getAppUrl(request);
  const settingsUrl = new URL("/settings/my-account", appUrl);

  if (!isZoomConfigured()) {
    settingsUrl.searchParams.set("zoom_error", "Zoom is not configured for this environment.");
    return NextResponse.redirect(settingsUrl, 307);
  }

  const state = crypto.randomUUID();
  cookies().set("zoom_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  const authUrl = getAuthorizationUrl({ state, redirectUri: `${appUrl}/api/zoom/connect/callback` });
  return NextResponse.redirect(authUrl, 307);
}
