import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getValidAccessToken } from "@/lib/zoom/tokens";

export const dynamic = "force-dynamic";

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

// Zoom refresh tokens are only valid for 90 days *from their last use* --
// since "Create Zoom meeting" is a manual action, an infrequent user could
// otherwise go quiet long enough for their connection to silently die.
// Exercising the refresh flow here keeps it alive indefinitely without
// requiring an actual meeting-creation call.
export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const cutoff = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();

  const { data: stale } = await supabase
    .from("user_zoom_connections")
    .select("user_id")
    .eq("status", "connected")
    .or(`refresh_token_rotated_at.is.null,refresh_token_rotated_at.lt.${cutoff}`);

  let refreshed = 0;
  let failed = 0;
  for (const row of stale ?? []) {
    const result = await getValidAccessToken(supabase, row.user_id);
    if (result.ok) refreshed += 1;
    else failed += 1;
  }

  return NextResponse.json({ checked: stale?.length ?? 0, refreshed, failed });
}
