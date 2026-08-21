import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getAuthorizationUrl, isGoogleCalendarConfigured } from "@/lib/calendarSync/google";
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
  const settingsUrl = new URL("/settings/integrations", appUrl);

  if (!isGoogleCalendarConfigured()) {
    settingsUrl.searchParams.set("google_calendar_error", "Google Calendar is not configured for this environment.");
    return NextResponse.redirect(settingsUrl, 307);
  }

  const state = crypto.randomUUID();
  cookies().set("google_calendar_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  const authUrl = getAuthorizationUrl({ state, redirectUri: `${appUrl}/api/calendar/google/callback` });
  return NextResponse.redirect(authUrl, 307);
}
