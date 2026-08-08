import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getAuthorizationUrl } from "@/lib/zoom/client";
import { isZoomConfigured } from "@/lib/providerStatus";

export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
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
