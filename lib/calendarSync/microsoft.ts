// Outlook / Microsoft 365 Calendar (user-managed OAuth app, "common" tenant
// so it works for both personal Outlook.com accounts and work/school M365
// accounts). Same shape as lib/calendarSync/google.ts.
const MS_AUTHORITY = "https://login.microsoftonline.com/common/oauth2/v2.0";
const GRAPH_API = "https://graph.microsoft.com/v1.0";
const SCOPES = "offline_access User.Read Calendars.ReadWrite";

export type MicrosoftResult<T> = { ok: true; data: T } | { ok: false; reason: string };

export function isMicrosoftCalendarConfigured() {
  return !!process.env.MICROSOFT_CALENDAR_CLIENT_ID && !!process.env.MICROSOFT_CALENDAR_CLIENT_SECRET;
}

export function getAuthorizationUrl({ state, redirectUri }: { state: string; redirectUri: string }): string {
  const params = new URLSearchParams({
    client_id: process.env.MICROSOFT_CALENDAR_CLIENT_ID ?? "",
    redirect_uri: redirectUri,
    response_type: "code",
    response_mode: "query",
    scope: SCOPES,
    state,
  });
  return `${MS_AUTHORITY}/authorize?${params.toString()}`;
}

type TokenResponse = { access_token: string; refresh_token?: string; expires_in: number };

export async function exchangeCodeForTokens({ code, redirectUri }: { code: string; redirectUri: string }): Promise<MicrosoftResult<TokenResponse>> {
  if (!isMicrosoftCalendarConfigured()) return { ok: false, reason: "Outlook Calendar is not configured for this environment." };

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: process.env.MICROSOFT_CALENDAR_CLIENT_ID ?? "",
    client_secret: process.env.MICROSOFT_CALENDAR_CLIENT_SECRET ?? "",
    scope: SCOPES,
  });
  const res = await fetch(`${MS_AUTHORITY}/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { ok: false, reason: `Microsoft responded with ${res.status}: ${text}` };
  }
  return { ok: true, data: (await res.json()) as TokenResponse };
}

export async function refreshTokens({ refreshToken }: { refreshToken: string }): Promise<MicrosoftResult<TokenResponse>> {
  if (!isMicrosoftCalendarConfigured()) return { ok: false, reason: "Outlook Calendar is not configured for this environment." };

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: process.env.MICROSOFT_CALENDAR_CLIENT_ID ?? "",
    client_secret: process.env.MICROSOFT_CALENDAR_CLIENT_SECRET ?? "",
    scope: SCOPES,
  });
  const res = await fetch(`${MS_AUTHORITY}/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { ok: false, reason: `Microsoft responded with ${res.status}: ${text}` };
  }
  return { ok: true, data: (await res.json()) as TokenResponse };
}

export async function getMicrosoftProfile({ accessToken }: { accessToken: string }): Promise<MicrosoftResult<{ email: string }>> {
  const res = await fetch(`${GRAPH_API}/me`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { ok: false, reason: `Microsoft responded with ${res.status}: ${text}` };
  }
  const data = (await res.json()) as { mail?: string; userPrincipalName?: string };
  const email = data.mail ?? data.userPrincipalName;
  if (!email) return { ok: false, reason: "Microsoft account has no email address on file." };
  return { ok: true, data: { email } };
}

type EventInput = {
  title: string;
  description?: string | null;
  location?: string | null;
  startAtIso: string;
  endAtIso: string;
};

// Graph wants a timeZone alongside each dateTime rather than accepting a
// bare offset -- "UTC" is always valid since the ISO strings we pass in are
// already UTC (appointments.start_at/end_at are timestamptz, serialized
// with a Z offset).
function toGraphEventBody(event: EventInput) {
  return {
    subject: event.title,
    body: event.description ? { contentType: "text", content: event.description } : undefined,
    location: event.location ? { displayName: event.location } : undefined,
    start: { dateTime: event.startAtIso, timeZone: "UTC" },
    end: { dateTime: event.endAtIso, timeZone: "UTC" },
  };
}

export async function createMicrosoftEvent({ accessToken, event }: { accessToken: string; event: EventInput }): Promise<MicrosoftResult<{ id: string }>> {
  const res = await fetch(`${GRAPH_API}/me/events`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(toGraphEventBody(event)),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { ok: false, reason: `Microsoft responded with ${res.status}: ${text}` };
  }
  const data = (await res.json()) as { id: string };
  return { ok: true, data: { id: data.id } };
}

export async function updateMicrosoftEvent({
  accessToken,
  eventId,
  event,
}: {
  accessToken: string;
  eventId: string;
  event: EventInput;
}): Promise<MicrosoftResult<{ id: string }>> {
  const res = await fetch(`${GRAPH_API}/me/events/${encodeURIComponent(eventId)}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(toGraphEventBody(event)),
  });
  if (res.status === 404) return { ok: false, reason: "not_found" };
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { ok: false, reason: `Microsoft responded with ${res.status}: ${text}` };
  }
  const data = (await res.json()) as { id: string };
  return { ok: true, data: { id: data.id } };
}

export async function deleteMicrosoftEvent({ accessToken, eventId }: { accessToken: string; eventId: string }): Promise<MicrosoftResult<{ deleted: boolean }>> {
  const res = await fetch(`${GRAPH_API}/me/events/${encodeURIComponent(eventId)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok && res.status !== 404) {
    const text = await res.text().catch(() => "");
    return { ok: false, reason: `Microsoft responded with ${res.status}: ${text}` };
  }
  return { ok: true, data: { deleted: true } };
}

// getSchedule is an Exchange/M365 mailbox feature -- it works reliably for
// work/school accounts and may 4xx for a personal outlook.com account with
// no mailbox of that kind. Callers treat a failure here as "no additional
// busy blocks from this connection" rather than blocking the whole check.
export async function getMicrosoftSchedule({
  accessToken,
  email,
  startIso,
  endIso,
}: {
  accessToken: string;
  email: string;
  startIso: string;
  endIso: string;
}): Promise<MicrosoftResult<{ start: string; end: string }[]>> {
  const res = await fetch(`${GRAPH_API}/me/calendar/getSchedule`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", Prefer: 'outlook.timezone="UTC"' },
    body: JSON.stringify({
      schedules: [email],
      startTime: { dateTime: startIso, timeZone: "UTC" },
      endTime: { dateTime: endIso, timeZone: "UTC" },
      availabilityViewInterval: 15,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { ok: false, reason: `Microsoft responded with ${res.status}: ${text}` };
  }
  const data = (await res.json()) as {
    value?: { scheduleItems?: { status: string; start: { dateTime: string }; end: { dateTime: string } }[] }[];
  };
  const items = data.value?.[0]?.scheduleItems ?? [];
  const busy = items
    .filter((i) => i.status === "busy" || i.status === "tentative" || i.status === "oof")
    .map((i) => ({ start: `${i.start.dateTime}Z`, end: `${i.end.dateTime}Z` }));
  return { ok: true, data: busy };
}
