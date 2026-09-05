import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { reportSystemFailure } from "@/lib/systemFailures";
import { withJobLogging } from "@/lib/cron/withJobLogging";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const STALE_AFTER_MINUTES = 30;
const REALERT_AFTER_HOURS = 3;
const MAX_ROWS_PER_QUEUE = 200;

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

type QueueCheck = {
  source: string;
  label: string;
  table: "pending_portal_invites" | "pending_engagement_letter_sends" | "automation_webhook_deliveries" | "automation_pending_steps";
  statusColumn: string;
  statusValue: string;
  ageColumn: string;
};

// The drain crons (send-pending-portal-invites, send-pending-engagement-letters,
// send-pending-automation-webhooks, run-pending-automation-steps) each mark
// their own rows sent/failed on every success or error -- but none of that
// helps if the cron itself silently stops picking rows up at all, which is
// exactly what happened to a stuck portal invite: the queue row sat at
// 'pending' indefinitely and nothing ever raised an exception, so nothing
// ever reached system_failure_log or the Systems dashboard. This is the
// safety net for that failure mode -- it doesn't care why a queue stalled,
// only that it has, so a future bug like that one still surfaces here
// instead of depending on staff noticing a client complaint.
const QUEUE_CHECKS: QueueCheck[] = [
  {
    source: "stale-queue:pending_portal_invites",
    label: "portal invite",
    table: "pending_portal_invites",
    statusColumn: "status",
    statusValue: "pending",
    ageColumn: "created_at",
  },
  {
    source: "stale-queue:pending_engagement_letter_sends",
    label: "engagement letter send",
    table: "pending_engagement_letter_sends",
    statusColumn: "status",
    statusValue: "pending",
    ageColumn: "created_at",
  },
  {
    source: "stale-queue:automation_webhook_deliveries",
    label: "automation webhook delivery",
    table: "automation_webhook_deliveries",
    statusColumn: "status",
    statusValue: "pending",
    ageColumn: "next_attempt_at",
  },
  {
    source: "stale-queue:automation_pending_steps",
    label: "delayed automation step",
    table: "automation_pending_steps",
    statusColumn: "status",
    statusValue: "pending_delay",
    ageColumn: "scheduled_for",
  },
];

async function findStale(supabase: ReturnType<typeof createServiceClient>, check: QueueCheck) {
  const cutoffIso = new Date(Date.now() - STALE_AFTER_MINUTES * 60 * 1000).toISOString();

  // The column set is only known at runtime (it varies per queue), which
  // defeats supabase-js's literal-string select typing -- fall back to an
  // untyped query builder for this one dynamic call and cast the result.
  const query = supabase.from(check.table) as any;
  const { data: rows, error } = await query
    .select(`id, workspace_id, ${check.ageColumn}`)
    .eq(check.statusColumn, check.statusValue)
    .lt(check.ageColumn, cutoffIso)
    .order(check.ageColumn, { ascending: true })
    .limit(MAX_ROWS_PER_QUEUE);

  if (error) {
    console.error(`check-stale-automation-queues: could not query ${check.table}`, error);
    return null;
  }
  if (!rows || rows.length === 0) return null;

  const oldest = rows[0] as unknown as { id: string; workspace_id: string | null; [key: string]: unknown };
  const oldestTimestamp = oldest[check.ageColumn] as string;
  const ageMinutes = Math.round((Date.now() - new Date(oldestTimestamp).getTime()) / 60000);

  return { count: rows.length, ageMinutes, workspaceId: oldest.workspace_id, oldestId: oldest.id };
}

async function alreadyAlertedRecently(supabase: ReturnType<typeof createServiceClient>, source: string) {
  const cutoffIso = new Date(Date.now() - REALERT_AFTER_HOURS * 60 * 60 * 1000).toISOString();
  const { data } = await supabase.from("system_failure_log").select("id").eq("source", source).gte("created_at", cutoffIso).limit(1);
  return (data?.length ?? 0) > 0;
}

async function handleGET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const alerted: string[] = [];
  const stale: string[] = [];

  for (const check of QUEUE_CHECKS) {
    const finding = await findStale(supabase, check);
    if (!finding) continue;

    stale.push(check.source);

    if (await alreadyAlertedRecently(supabase, check.source)) continue;

    await reportSystemFailure(
      check.source,
      `${finding.count} ${check.label} job${finding.count === 1 ? " has" : "s have"} been stuck pending for over ${STALE_AFTER_MINUTES} minutes (oldest is ${finding.ageMinutes} min old) -- the drain cron for this queue may be failing silently.`,
      { workspaceId: finding.workspaceId ?? undefined, context: { table: check.table, oldestId: finding.oldestId, count: finding.count, ageMinutes: finding.ageMinutes } }
    );
    alerted.push(check.source);
  }

  return NextResponse.json({ checked: QUEUE_CHECKS.length, stale, alerted });
}

export const GET = withJobLogging("check-stale-automation-queues", handleGET);
