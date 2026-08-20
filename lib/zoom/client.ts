import { isZoomConfigured } from "@/lib/providerStatus";

const ZOOM_OAUTH = "https://zoom.us/oauth";
const ZOOM_API = "https://api.zoom.us/v2";

export type ZoomResult<T> = { ok: true; data: T } | { ok: false; reason: string };

function basicAuthHeader(): string {
  const credentials = Buffer.from(`${process.env.ZOOM_CLIENT_ID}:${process.env.ZOOM_CLIENT_SECRET}`).toString("base64");
  return `Basic ${credentials}`;
}

export function getAuthorizationUrl({ state, redirectUri }: { state: string; redirectUri: string }): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.ZOOM_CLIENT_ID ?? "",
    redirect_uri: redirectUri,
    state,
  });
  return `${ZOOM_OAUTH}/authorize?${params.toString()}`;
}

type TokenResponse = { access_token: string; refresh_token: string; expires_in: number };

export async function exchangeCodeForTokens({
  code,
  redirectUri,
}: {
  code: string;
  redirectUri: string;
}): Promise<ZoomResult<TokenResponse>> {
  if (!isZoomConfigured()) return { ok: false, reason: "Zoom is not configured for this environment." };

  const body = new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri });
  const res = await fetch(`${ZOOM_OAUTH}/token`, {
    method: "POST",
    headers: { Authorization: basicAuthHeader(), "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { ok: false, reason: `Zoom responded with ${res.status}: ${text}` };
  }
  const data = (await res.json()) as TokenResponse;
  return { ok: true, data };
}

export async function refreshTokens({ refreshToken }: { refreshToken: string }): Promise<ZoomResult<TokenResponse>> {
  if (!isZoomConfigured()) return { ok: false, reason: "Zoom is not configured for this environment." };

  const body = new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken });
  const res = await fetch(`${ZOOM_OAUTH}/token`, {
    method: "POST",
    headers: { Authorization: basicAuthHeader(), "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { ok: false, reason: `Zoom responded with ${res.status}: ${text}` };
  }
  const data = (await res.json()) as TokenResponse;
  return { ok: true, data };
}

export async function revokeToken({ token }: { token: string }): Promise<ZoomResult<{ status: string }>> {
  if (!isZoomConfigured()) return { ok: false, reason: "Zoom is not configured for this environment." };

  const body = new URLSearchParams({ token });
  const res = await fetch(`${ZOOM_OAUTH}/revoke`, {
    method: "POST",
    headers: { Authorization: basicAuthHeader(), "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { ok: false, reason: `Zoom responded with ${res.status}: ${text}` };
  }
  return { ok: true, data: { status: "revoked" } };
}

export async function getZoomProfile({ accessToken }: { accessToken: string }): Promise<ZoomResult<{ id: string; email: string }>> {
  const res = await fetch(`${ZOOM_API}/users/me`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { ok: false, reason: `Zoom responded with ${res.status}: ${text}` };
  }
  const data = (await res.json()) as { id: string; email: string };
  return { ok: true, data: { id: data.id, email: data.email } };
}

export async function createZoomMeeting({
  accessToken,
  topic,
  startTimeIso,
  durationMinutes,
}: {
  accessToken: string;
  topic: string;
  startTimeIso: string;
  durationMinutes: number;
}): Promise<ZoomResult<{ id: number; join_url: string; start_url: string }>> {
  const res = await fetch(`${ZOOM_API}/users/me/meetings`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      topic,
      type: 2,
      start_time: startTimeIso,
      duration: durationMinutes,
      timezone: "UTC",
      settings: { join_before_host: true, waiting_room: false },
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { ok: false, reason: `Zoom responded with ${res.status}: ${text}` };
  }
  const data = (await res.json()) as { id: number; join_url: string; start_url: string };
  return { ok: true, data };
}

/**
 * Verifies Zoom's webhook signature scheme: HMAC-SHA256 over
 * "v0:<timestamp>:<rawBody>" using the app's Secret Token, hex-encoded and
 * prefixed "v0=". Applies to both delivered events and the validation
 * handshake below.
 */
export async function verifyZoomWebhookSignature(rawBody: string, timestamp: string, signatureHeader: string, secret: string): Promise<boolean> {
  const crypto = await import("crypto");
  const expected = `v0=${crypto.createHmac("sha256", secret).update(`v0:${timestamp}:${rawBody}`).digest("hex")}`;
  const expectedBuf = Buffer.from(expected);
  const signatureBuf = Buffer.from(signatureHeader);
  if (expectedBuf.length !== signatureBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, signatureBuf);
}

/**
 * Zoom's one-time endpoint URL validation handshake: echo the plainToken
 * back along with an HMAC of it, both using the same Secret Token.
 */
export async function buildZoomCrcResponse(plainToken: string, secret: string): Promise<{ plainToken: string; encryptedToken: string }> {
  const crypto = await import("crypto");
  const encryptedToken = crypto.createHmac("sha256", secret).update(plainToken).digest("hex");
  return { plainToken, encryptedToken };
}
