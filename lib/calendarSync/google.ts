// Google Calendar (user-managed OAuth app -- each staff member connects
// their own personal Google account, same pattern as lib/zoom/client.ts).
const GOOGLE_OAUTH = "https://accounts.google.com/o/oauth2/v2";
const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";
const GOOGLE_API = "https://www.googleapis.com/calendar/v3";
const GOOGLE_USERINFO = "https://www.googleapis.com/oauth2/v2/userinfo";
const SCOPES = "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.freebusy";

export type GoogleResult<T> = { ok: true; data: T } | { ok: false; reason: string };

export function isGoogleCalendarConfigured() {
  return !!process.env.GOOGLE_CALENDAR_CLIENT_ID && !!process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
}

export function getAuthorizationUrl({ state, redirectUri }: { state: string; redirectUri: string }): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CALENDAR_CLIENT_ID ?? "",
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPES,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `${GOOGLE_OAUTH}/auth?${params.toString()}`;
}

type TokenResponse = { access_token: string; refresh_token?: string; expires_in: number };

export async function exchangeCodeForTokens({ code, redirectUri }: { code: string; redirectUri: string }): Promise<GoogleResult<TokenResponse>> {
  if (!isGoogleCalendarConfigured()) return { ok: false, reason: "Google Calendar is not configured for this environment." };

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: process.env.GOOGLE_CALENDAR_CLIENT_ID ?? "",
    client_secret: process.env.GOOGLE_CALENDAR_CLIENT_SECRET ?? "",
  });
  const res = await fetch(GOOGLE_TOKEN, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { ok: false, reason: `Google responded with ${res.status}: ${text}` };
  }
  return { ok: true, data: (await res.json()) as TokenResponse };
}

export async function refreshTokens({ refreshToken }: { refreshToken: string }): Promise<GoogleResult<TokenResponse>> {
  if (!isGoogleCalendarConfigured()) return { ok: false, reason: "Google Calendar is not configured for this environment." };

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: process.env.GOOGLE_CALENDAR_CLIENT_ID ?? "",
    client_secret: process.env.GOOGLE_CALENDAR_CLIENT_SECRET ?? "",
  });
  const res = await fetch(GOOGLE_TOKEN, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { ok: false, reason: `Google responded with ${res.status}: ${text}` };
  }
  // Google only returns a refresh_token on the *first* consent -- callers
  // must keep reusing the original one on subsequent refreshes.
  return { ok: true, data: (await res.json()) as TokenResponse };
}

export async function revokeToken({ token }: { token: string }): Promise<GoogleResult<{ status: string }>> {
  const res = await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: "POST" });
  if (!res.ok && res.status !== 400) {
    const text = await res.text().catch(() => "");
    return { ok: false, reason: `Google responded with ${res.status}: ${text}` };
  }
  return { ok: true, data: { status: "revoked" } };
}

export async function getGoogleProfile({ accessToken }: { accessToken: string }): Promise<GoogleResult<{ email: string }>> {
  const res = await fetch(GOOGLE_USERINFO, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { ok: false, reason: `Google responded with ${res.status}: ${text}` };
  }
  const data = (await res.json()) as { email: string };
  return { ok: true, data: { email: data.email } };
}

type EventInput = {
  title: string;
  description?: string | null;
  location?: string | null;
  startAtIso: string;
  endAtIso: string;
};

function toGoogleEventBody(event: EventInput) {
  return {
    summary: event.title,
    description: event.description ?? undefined,
    location: event.location ?? undefined,
    start: { dateTime: event.startAtIso },
    end: { dateTime: event.endAtIso },
  };
}

export async function createGoogleEvent({
  accessToken,
  calendarId,
  event,
}: {
  accessToken: string;
  calendarId: string;
  event: EventInput;
}): Promise<GoogleResult<{ id: string }>> {
  const res = await fetch(`${GOOGLE_API}/calendars/${encodeURIComponent(calendarId)}/events`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(toGoogleEventBody(event)),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { ok: false, reason: `Google responded with ${res.status}: ${text}` };
  }
  const data = (await res.json()) as { id: string };
  return { ok: true, data: { id: data.id } };
}

export async function updateGoogleEvent({
  accessToken,
  calendarId,
  eventId,
  event,
}: {
  accessToken: string;
  calendarId: string;
  eventId: string;
  event: EventInput;
}): Promise<GoogleResult<{ id: string }>> {
  const res = await fetch(`${GOOGLE_API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(toGoogleEventBody(event)),
  });
  // A 404 here means the event was deleted on the Google side by hand --
  // treat that as "needs to be recreated," which the caller does by falling
  // back to createGoogleEvent.
  if (res.status === 404) return { ok: false, reason: "not_found" };
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { ok: false, reason: `Google responded with ${res.status}: ${text}` };
  }
  const data = (await res.json()) as { id: string };
  return { ok: true, data: { id: data.id } };
}

export async function deleteGoogleEvent({
  accessToken,
  calendarId,
  eventId,
}: {
  accessToken: string;
  calendarId: string;
  eventId: string;
}): Promise<GoogleResult<{ deleted: boolean }>> {
  const res = await fetch(`${GOOGLE_API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  // Already gone (404/410) counts as success -- that's the state we wanted.
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    const text = await res.text().catch(() => "");
    return { ok: false, reason: `Google responded with ${res.status}: ${text}` };
  }
  return { ok: true, data: { deleted: true } };
}

export async function getGoogleFreeBusy({
  accessToken,
  calendarId,
  startIso,
  endIso,
}: {
  accessToken: string;
  calendarId: string;
  startIso: string;
  endIso: string;
}): Promise<GoogleResult<{ start: string; end: string }[]>> {
  const res = await fetch(`${GOOGLE_API}/freeBusy`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ timeMin: startIso, timeMax: endIso, items: [{ id: calendarId }] }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { ok: false, reason: `Google responded with ${res.status}: ${text}` };
  }
  const data = (await res.json()) as { calendars?: Record<string, { busy?: { start: string; end: string }[] }> };
  return { ok: true, data: data.calendars?.[calendarId]?.busy ?? [] };
}
