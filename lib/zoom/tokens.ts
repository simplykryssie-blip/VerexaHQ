import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { refreshTokens } from "@/lib/zoom/client";

export type ZoomAccessResult = { ok: true; accessToken: string } | { ok: false; reason: string };

const REFRESH_MARGIN_MS = 5 * 60 * 1000;

/**
 * Returns a live access token for the given user's Zoom connection,
 * transparently refreshing it first if it's within 5 minutes of expiring.
 * Marks the connection "revoked" if a refresh attempt actually fails
 * (as opposed to the connection simply not existing), so the UI can
 * distinguish "never connected" from "needs reconnecting."
 */
export async function getValidAccessToken(supabase: SupabaseClient<Database>, userId: string): Promise<ZoomAccessResult> {
  const { data: connection } = await supabase
    .from("user_zoom_connections")
    .select("id, status, access_token_encrypted, refresh_token_encrypted, token_expires_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (!connection || connection.status !== "connected") {
    return { ok: false, reason: "Zoom isn't connected. Connect it in Settings > My Account to create meetings." };
  }

  const expiresSoon = !connection.token_expires_at || new Date(connection.token_expires_at).getTime() - Date.now() < REFRESH_MARGIN_MS;

  if (!expiresSoon && connection.access_token_encrypted) {
    const { data: accessToken } = await supabase.rpc("decrypt_zoom_secret", { p_ciphertext: connection.access_token_encrypted });
    if (accessToken) return { ok: true, accessToken };
  }

  if (!connection.refresh_token_encrypted) {
    return { ok: false, reason: "Zoom connection is missing its refresh token. Reconnect it in Settings > My Account." };
  }
  const { data: refreshToken } = await supabase.rpc("decrypt_zoom_secret", { p_ciphertext: connection.refresh_token_encrypted });
  if (!refreshToken) {
    return { ok: false, reason: "Zoom connection is missing its refresh token. Reconnect it in Settings > My Account." };
  }

  const refreshed = await refreshTokens({ refreshToken });
  if (!refreshed.ok) {
    await supabase.from("user_zoom_connections").update({ status: "revoked" }).eq("id", connection.id);
    return { ok: false, reason: "Zoom connection expired. Reconnect it in Settings > My Account." };
  }

  const [{ data: newAccessEncrypted }, { data: newRefreshEncrypted }] = await Promise.all([
    supabase.rpc("encrypt_zoom_secret", { p_plaintext: refreshed.data.access_token }),
    supabase.rpc("encrypt_zoom_secret", { p_plaintext: refreshed.data.refresh_token }),
  ]);

  await supabase
    .from("user_zoom_connections")
    .update({
      access_token_encrypted: newAccessEncrypted,
      refresh_token_encrypted: newRefreshEncrypted,
      token_expires_at: new Date(Date.now() + refreshed.data.expires_in * 1000).toISOString(),
      refresh_token_rotated_at: new Date().toISOString(),
    })
    .eq("id", connection.id);

  return { ok: true, accessToken: refreshed.data.access_token };
}
