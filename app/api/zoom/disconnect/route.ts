import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { revokeToken } from "@/lib/zoom/client";

export async function POST() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // encrypt_zoom_secret/decrypt_zoom_secret are locked to service_role, so
  // the actual connection read/write happens through the service client --
  // still scoped to this authenticated user's own id, never a caller-supplied one.
  const serviceClient = createServiceClient();
  const { data: connection } = await serviceClient
    .from("user_zoom_connections")
    .select("id, access_token_encrypted")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!connection) {
    return NextResponse.json({ ok: true });
  }

  if (connection.access_token_encrypted) {
    const { data: accessToken } = await serviceClient.rpc("decrypt_zoom_secret", { p_ciphertext: connection.access_token_encrypted });
    if (accessToken) {
      // Best-effort -- local state is cleared regardless of whether Zoom's
      // own revoke call succeeds.
      await revokeToken({ token: accessToken });
    }
  }

  await serviceClient
    .from("user_zoom_connections")
    .update({
      status: "disconnected",
      access_token_encrypted: null,
      refresh_token_encrypted: null,
      token_expires_at: null,
    })
    .eq("id", connection.id);

  return NextResponse.json({ ok: true });
}
