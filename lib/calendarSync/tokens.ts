import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import * as google from "@/lib/calendarSync/google";
import * as microsoft from "@/lib/calendarSync/microsoft";

export type CalendarProvider = "google" | "microsoft";
export type CalendarAccessResult = { ok: true; accessToken: string } | { ok: false; reason: string };

const REFRESH_MARGIN_MS = 5 * 60 * 1000;

/**
 * Returns a live access token for the given user's Google or Outlook
 * connection, transparently refreshing it first if it's within 5 minutes
 * of expiring. Mirrors lib/zoom/tokens.ts. Marks the connection "revoked"
 * if a refresh attempt actually fails, so the UI can tell "never connected"
 * apart from "needs reconnecting."
 */
export async function getValidAccessToken(
  supabase: SupabaseClient<Database>,
  userId: string,
  provider: CalendarProvider
): Promise<CalendarAccessResult> {
  const { data: connection } = await supabase
    .from("user_calendar_connections")
    .select("id, status, access_token_encrypted, refresh_token_encrypted, token_expires_at")
    .eq("user_id", userId)
    .eq("provider", provider)
    .maybeSingle();

  const label = provider === "google" ? "Google Calendar" : "Outlook Calendar";
  if (!connection || connection.status !== "connected") {
    return { ok: false, reason: `${label} isn't connected. Connect it in Settings > Integrations.` };
  }

  const expiresSoon = !connection.token_expires_at || new Date(connection.token_expires_at).getTime() - Date.now() < REFRESH_MARGIN_MS;

  if (!expiresSoon && connection.access_token_encrypted) {
    const { data: accessToken } = await supabase.rpc("decrypt_calendar_secret", { p_ciphertext: connection.access_token_encrypted });
    if (accessToken) return { ok: true, accessToken };
  }

  if (!connection.refresh_token_encrypted) {
    return { ok: false, reason: `${label} connection is missing its refresh token. Reconnect it in Settings > Integrations.` };
  }
  const { data: refreshToken } = await supabase.rpc("decrypt_calendar_secret", { p_ciphertext: connection.refresh_token_encrypted });
  if (!refreshToken) {
    return { ok: false, reason: `${label} connection is missing its refresh token. Reconnect it in Settings > Integrations.` };
  }

  const refreshed = provider === "google" ? await google.refreshTokens({ refreshToken }) : await microsoft.refreshTokens({ refreshToken });
  if (!refreshed.ok) {
    await supabase.from("user_calendar_connections").update({ status: "revoked" }).eq("id", connection.id);
    return { ok: false, reason: `${label} connection expired. Reconnect it in Settings > Integrations.` };
  }

  const [{ data: newAccessEncrypted }, { data: newRefreshEncrypted }] = await Promise.all([
    supabase.rpc("encrypt_calendar_secret", { p_plaintext: refreshed.data.access_token }),
    // Google only sends a refresh_token back on first consent -- keep the
    // existing one on file if this refresh response didn't include a new one.
    refreshed.data.refresh_token
      ? supabase.rpc("encrypt_calendar_secret", { p_plaintext: refreshed.data.refresh_token })
      : Promise.resolve({ data: connection.refresh_token_encrypted }),
  ]);

  await supabase
    .from("user_calendar_connections")
    .update({
      access_token_encrypted: newAccessEncrypted,
      refresh_token_encrypted: newRefreshEncrypted,
      token_expires_at: new Date(Date.now() + refreshed.data.expires_in * 1000).toISOString(),
      refresh_token_rotated_at: new Date().toISOString(),
    })
    .eq("id", connection.id);

  return { ok: true, accessToken: refreshed.data.access_token };
}
