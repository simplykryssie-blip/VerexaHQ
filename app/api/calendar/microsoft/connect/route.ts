import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getAuthorizationUrl, isMicrosoftCalendarConfigured } from "@/lib/calendarSync/microsoft";
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

  if (!isMicrosoftCalendarConfigured()) {
    settingsUrl.searchParams.set("microsoft_calendar_error", "Outlook Calendar is not configured for this environment.");
    return NextResponse.redirect(settingsUrl, 307);
  }

  const state = crypto.randomUUID();
  cookies().set("microsoft_calendar_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  const authUrl = getAuthorizationUrl({ state, redirectUri: `${appUrl}/api/calendar/microsoft/callback` });
  return NextResponse.redirect(authUrl, 307);
}
