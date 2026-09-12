import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { reportSystemFailure } from "@/lib/systemFailures";
import { withJobLogging } from "@/lib/cron/withJobLogging";
import { withSupabaseRetry } from "@/lib/supabase/withRetry";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const STALE_AFTER_MINUTES = 30;
const REALERT_AFTER_HOURS = 3;
const MAX_ROWS_PER_QUEUE = 200;
// A "wait until condition" step deliberately sits in pending_delay -- re-checked
// every run-pending-automation-steps tick -- for up to its own wait_timeout_days,
// only advancing early if the condition is met sooner. That's normal, not stuck,
// so it gets its own (much longer) threshold instead of the flat 30 minutes below.
// The grace period covers the timeout-check's own cron cadence plus RPC latency.
const CONDITION_WAIT_GRACE_MINUTES = 60;

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
];

const AUTOMATION_PENDING_STEPS_SOURCE = "stale-queue:automation_pending_steps";

type WaitActionConfig = { wait_mode?: string; wait_timeout_days?: number } | null | undefined;

// automation_pending_steps needs its own check, separate from the generic
// QUEUE_CHECKS loop above: a "wait until condition" step deliberately sits
// here -- re-checked every run-pending-automation-steps tick -- for up to
// its own wait_timeout_days, only advancing early once the condition is
// met. A client who simply hasn't submitted their organizer yet isn't a
// stuck drain cron, so this uses each row's own timeout instead of the flat
// STALE_AFTER_MINUTES the other queues use.
async function findStaleAutomationSteps(supabase: ReturnType<typeof createServiceClient>) {
  const cutoffIso = new Date(Date.now() - STALE_AFTER_MINUTES * 60 * 1000).toISOString();

  const { data: rows, error } = await withSupabaseRetry(() =>
    supabase
      .from("automation_pending_steps")
      .select("id, workspace_id, scheduled_for, automation_steps(action_config)")
      .eq("status", "pending_delay")
      .lt("scheduled_for", cutoffIso)
      .order("scheduled_for", { ascending: true })
      .limit(MAX_ROWS_PER_QUEUE)
  );

  if (error) {
    console.error("check-stale-automation-queues: could not query automation_pending_steps", error);
    return null;
  }
  if (!rows || rows.length === 0) return null;

  const now = Date.now();
  const trulyStale = rows.filter((row) => {
    if (!row.scheduled_for) return false;
    const config = (row.automation_steps as unknown as { action_config?: WaitActionConfig } | null)?.action_config;
    const ageMinutes = (now - new Date(row.scheduled_for).getTime()) / 60000;
    if (config?.wait_mode === "until_condition") {
      const timeoutMinutes = (config.wait_timeout_days ?? 1) * 24 * 60 + CONDITION_WAIT_GRACE_MINUTES;
      return ageMinutes > timeoutMinutes;
    }
    return ageMinutes > STALE_AFTER_MINUTES;
  });

  if (trulyStale.length === 0) return null;

  const oldest = trulyStale[0] as unknown as { id: string; workspace_id: string | null; scheduled_for: string };
  const ageMinutes = Math.round((now - new Date(oldest.scheduled_for).getTime()) / 60000);

  return { count: trulyStale.length, ageMinutes, workspaceId: oldest.workspace_id, oldestId: oldest.id };
}

async function findStale(supabase: ReturnType<typeof createServiceClient>, check: QueueCheck) {
  const cutoffIso = new Date(Date.now() - STALE_AFTER_MINUTES * 60 * 1000).toISOString();

  // The column set is only known at runtime (it varies per queue), which
  // defeats supabase-js's literal-string select typing -- fall back to an
  // untyped query builder for this one dynamic call and cast the result.
  const query = supabase.from(check.table) as any;
  const { data: rows, error } = await withSupabaseRetry<any[]>(() =>
    query
      .select(`id, workspace_id, ${check.ageColumn}`)
      .eq(check.statusColumn, check.statusValue)
      .lt(check.ageColumn, cutoffIso)
      .order(check.ageColumn, { ascending: true })
      .limit(MAX_ROWS_PER_QUEUE)
  );

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

  const stepsFinding = await findStaleAutomationSteps(supabase);
  if (stepsFinding) {
    stale.push(AUTOMATION_PENDING_STEPS_SOURCE);
    if (!(await alreadyAlertedRecently(supabase, AUTOMATION_PENDING_STEPS_SOURCE))) {
      await reportSystemFailure(
        AUTOMATION_PENDING_STEPS_SOURCE,
        `${stepsFinding.count} delayed automation step${stepsFinding.count === 1 ? " has" : "s have"} been stuck pending well past its expected time (oldest is ${stepsFinding.ageMinutes} min old) -- the drain cron for this queue may be failing silently, or a "wait until condition" step's timeout isn't advancing it.`,
        { workspaceId: stepsFinding.workspaceId ?? undefined, context: { table: "automation_pending_steps", oldestId: stepsFinding.oldestId, count: stepsFinding.count, ageMinutes: stepsFinding.ageMinutes } }
      );
      alerted.push(AUTOMATION_PENDING_STEPS_SOURCE);
    }
  }

  return NextResponse.json({ checked: QUEUE_CHECKS.length + 1, stale, alerted });
}

export const GET = withJobLogging("check-stale-automation-queues", handleGET);
