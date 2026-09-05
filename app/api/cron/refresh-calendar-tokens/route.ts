import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getValidAccessToken } from "@/lib/calendarSync/tokens";
import { withJobLogging } from "@/lib/cron/withJobLogging";

export const dynamic = "force-dynamic";

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

// Google refresh tokens can be invalidated after ~6 months of no use, and
// Microsoft's rolling refresh-token window is ~90 days -- since actually
// using a connection only happens when an appointment changes for that
// staff member, a quiet solo practice could otherwise go long enough
// between appointments for the connection to silently die. Exercising the
// refresh flow here on a schedule keeps it alive indefinitely. Mirrors
// refresh-zoom-tokens.
async function handleGET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data: stale } = await supabase
    .from("user_calendar_connections")
    .select("user_id, provider")
    .eq("status", "connected")
    .or(`refresh_token_rotated_at.is.null,refresh_token_rotated_at.lt.${cutoff}`);

  let refreshed = 0;
  let failed = 0;
  for (const row of stale ?? []) {
    const result = await getValidAccessToken(supabase, row.user_id, row.provider as "google" | "microsoft");
    if (result.ok) refreshed += 1;
    else failed += 1;
  }

  return NextResponse.json({ checked: stale?.length ?? 0, refreshed, failed });
}

export const GET = withJobLogging("refresh-calendar-tokens", handleGET);
