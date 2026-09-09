import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { EXPECTED_INTERVAL_MINUTES } from "@/lib/cron/expectedIntervals";

// Lets a platform admin/IT user manually trigger one of the cron jobs from
// the Systems dashboard -- useful for draining a backlog right away once
// whatever caused it (a provider outage, a bad key) is fixed, rather than
// waiting for the next scheduled tick. Forwards to the job's own route
// with CRON_SECRET server-side, the same way Vercel's scheduler calls it --
// the secret never reaches the browser.
export async function POST(request: Request) {
  const supabase = createClient();
  const [{ data: isPlatformAdmin }, { data: isPlatformIt }] = await Promise.all([
    supabase.rpc("is_platform_admin"),
    supabase.rpc("is_platform_it"),
  ]);
  if (!isPlatformAdmin && !isPlatformIt) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const { jobKey } = (await request.json()) as { jobKey?: string };
  if (!jobKey || !(jobKey in EXPECTED_INTERVAL_MINUTES)) {
    return NextResponse.json({ error: "Unknown job" }, { status: 400 });
  }

  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 500 });
  }

  const target = new URL(`/api/cron/${jobKey}`, request.url);
  const response = await fetch(target, { headers: { authorization: `Bearer ${secret}` }, cache: "no-store" });
  const body = await response.json().catch(() => ({}));

  return NextResponse.json({ ok: response.ok, result: body }, { status: response.ok ? 200 : 502 });
}
