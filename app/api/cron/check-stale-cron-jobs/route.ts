import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { reportSystemFailure } from "@/lib/systemFailures";
import { withJobLogging } from "@/lib/cron/withJobLogging";
import { EXPECTED_INTERVAL_MINUTES, isStale } from "@/lib/cron/expectedIntervals";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const REALERT_AFTER_HOURS = 3;

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

async function alreadyAlertedRecently(supabase: ReturnType<typeof createServiceClient>, source: string) {
  const cutoffIso = new Date(Date.now() - REALERT_AFTER_HOURS * 60 * 60 * 1000).toISOString();
  const { data } = await supabase.from("system_failure_log").select("id").eq("source", source).gte("created_at", cutoffIso).limit(1);
  return (data?.length ?? 0) > 0;
}

// The per-queue staleness checks (check-stale-automation-queues) catch a
// cron that's still firing but not draining its queue. This catches the
// other failure mode: a cron that's stopped firing at all (removed from
// vercel.json by mistake, erroring before it logs anything, timing out
// every single run). Every route now logs to cron_job_runs via
// withJobLogging, so "no successful run within 2x its expected interval"
// is a real, actionable signal.
async function handleGET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const stale: string[] = [];
  const alerted: string[] = [];

  const { data: recentRuns } = await supabase
    .from("cron_job_runs")
    .select("job_key, status, completed_at")
    .eq("status", "success")
    .order("completed_at", { ascending: false })
    .limit(2000);

  const lastSuccessByJob = new Map<string, string>();
  for (const run of recentRuns ?? []) {
    if (!lastSuccessByJob.has(run.job_key)) lastSuccessByJob.set(run.job_key, run.completed_at);
  }

  for (const [jobKey, intervalMinutes] of Object.entries(EXPECTED_INTERVAL_MINUTES)) {
    const lastSuccessAt = lastSuccessByJob.get(jobKey) ?? null;
    if (!isStale(lastSuccessAt, intervalMinutes)) continue;

    stale.push(jobKey);
    const source = `cron-stale:${jobKey}`;
    if (await alreadyAlertedRecently(supabase, source)) continue;

    await reportSystemFailure(
      source,
      lastSuccessAt
        ? `Cron job "${jobKey}" hasn't logged a successful run since ${lastSuccessAt} (expected roughly every ${intervalMinutes} min).`
        : `Cron job "${jobKey}" has never logged a successful run.`
    );
    alerted.push(jobKey);
  }

  return NextResponse.json({ checked: Object.keys(EXPECTED_INTERVAL_MINUTES).length, stale, alerted });
}

export const GET = withJobLogging("check-stale-cron-jobs", handleGET);
