import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { revokeToken as revokeGoogleToken } from "@/lib/calendarSync/google";

export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { provider } = (await request.json().catch(() => ({}))) as { provider?: string };
  if (provider !== "google" && provider !== "microsoft") {
    return NextResponse.json({ error: "provider must be 'google' or 'microsoft'" }, { status: 400 });
  }

  // encrypt_calendar_secret/decrypt_calendar_secret are locked to
  // service_role, so the actual connection read/write happens through the
  // service client -- still scoped to this authenticated user's own id.
  const serviceClient = createServiceClient();
  const { data: connection } = await serviceClient
    .from("user_calendar_connections")
    .select("id, access_token_encrypted")
    .eq("user_id", user.id)
    .eq("provider", provider)
    .maybeSingle();

  if (!connection) {
    return NextResponse.json({ ok: true });
  }

  // Only Google has a revoke endpoint worth calling -- Microsoft access
  // tokens simply expire and there's no equivalent app-level revoke call
  // without admin consent, so local state is cleared for both either way.
  if (provider === "google" && connection.access_token_encrypted) {
    const { data: accessToken } = await serviceClient.rpc("decrypt_calendar_secret", { p_ciphertext: connection.access_token_encrypted });
    if (accessToken) {
      await revokeGoogleToken({ token: accessToken });
    }
  }

  await serviceClient
    .from("user_calendar_connections")
    .update({
      status: "disconnected",
      access_token_encrypted: null,
      refresh_token_encrypted: null,
      token_expires_at: null,
    })
    .eq("id", connection.id);

  return NextResponse.json({ ok: true });
}
