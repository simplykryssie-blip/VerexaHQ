import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { withJobLogging } from "@/lib/cron/withJobLogging";
import { isWorkspaceStatusOperational } from "@/lib/workspace";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BATCH_SIZE = 50;
// Rows are processed serially and each RPC call's latency is unbounded, so a
// full batch can exceed maxDuration. Stop with headroom to spare and leave
// the rest at 'pending_delay' -- they're picked up again on the next tick,
// so this is just as safe as finishing the batch, only spread over more runs.
const DEADLINE_MS = 45_000;

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

// Workflow steps with a delay sit in automation_pending_steps (status
// 'pending_delay') until their scheduled_for time passes. This drains that
// queue by calling the same execute_automation_step() RPC the trigger chain
// uses for zero-delay steps, then clears the pending row -- it was only ever
// a scheduling marker, not something staff need to see once it's resolved.
//
// A "wait until a condition is met" step schedules scheduled_for = now(), so
// it's due on every tick from the moment it starts waiting -- but it isn't
// necessarily ready to advance. should_advance_wait_until_step re-evaluates
// the condition (or the wait's timeout) each time; when it says no, the
// pending row is left exactly as-is so the next cron tick checks it again.
//
// A condition-type step opted into retry_until_matched (see
// start_next_automation_step) also parks here while none of its branches
// match yet -- but a condition step doesn't "execute" the way an action
// does, so advancing it calls start_next_automation_step(run_id) (which
// re-evaluates its branches from the run's current position) instead of
// execute_automation_step.
async function handleGET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const nowIso = new Date().toISOString();

  const { data: pending } = await supabase
    .from("automation_pending_steps")
    .select("id, run_id, workspace_id, automation_step_id, automation_steps(action_type), automation_runs(status)")
    .eq("status", "pending_delay")
    .lte("scheduled_for", nowIso)
    .order("scheduled_for", { ascending: true })
    .limit(BATCH_SIZE);

  // A due step's workspace can have gone non-operational since it was
  // queued. It must not execute, but the pending_delay row must also not
  // be deleted -- that's the only durable "still waiting" marker this step
  // has. Left in place, the next tick (after should_advance_wait_until_step
  // re-checks it, same as any other still-waiting row) picks it up again,
  // including once the workspace recovers to active.
  const pendingWorkspaceIds = Array.from(new Set((pending ?? []).map((row) => row.workspace_id)));
  const { data: pendingWorkspaceStatusRows } = pendingWorkspaceIds.length
    ? await supabase.from("workspaces").select("id, status").in("id", pendingWorkspaceIds)
    : { data: [] as { id: string; status: string }[] };
  const statusByWorkspaceId = new Map((pendingWorkspaceStatusRows ?? []).map((w) => [w.id, w.status]));

  const startedAt = Date.now();
  let processed = 0;
  let stillWaiting = 0;
  let deferred = 0;
  let blocked = 0;
  for (const row of pending ?? []) {
    if (Date.now() - startedAt > DEADLINE_MS) {
      deferred = (pending?.length ?? 0) - processed - stillWaiting;
      console.log(`run-pending-automation-steps: stopping early with ${deferred} row(s) left for the next tick`);
      break;
    }
    // The run may have been cancelled (e.g. a pending-approval step on it
    // was rejected) while this step was still waiting out its delay --
    // without this check the step would fire anyway once its time came,
    // even though the run it belongs to is no longer running.
    const runStatus = (row.automation_runs as unknown as { status?: string } | null)?.status;
    if (runStatus !== "running") {
      await supabase.from("automation_pending_steps").delete().eq("id", row.id);
      continue;
    }
    if (!isWorkspaceStatusOperational(statusByWorkspaceId.get(row.workspace_id) ?? "active")) {
      blocked++;
      continue;
    }
    const { data: shouldAdvance } = await supabase.rpc("should_advance_wait_until_step", { p_pending_id: row.id });
    if (shouldAdvance === false) {
      stillWaiting++;
      continue;
    }
    const actionType = (row.automation_steps as unknown as { action_type?: string } | null)?.action_type;
    if (actionType === "condition") {
      await supabase.rpc("start_next_automation_step", { p_run_id: row.run_id });
    } else {
      await supabase.rpc("execute_automation_step", { p_run_id: row.run_id, p_step_id: row.automation_step_id });
    }
    await supabase.from("automation_pending_steps").delete().eq("id", row.id);
    processed++;
  }

  // Runs left with blocked_at set are otherwise never revisited by anything.
  // Two distinct blocked shapes exist, and they resume differently:
  //   - blocked_step_id is null: start_next_automation_step's own gate
  //     blocked before resolving a next step, so current_step_id is already-
  //     completed work -- safe to resume by re-resolving "what's next" from
  //     it, same as every other resume path in this cron.
  //   - blocked_step_id is set: execute_automation_step's gate blocked while
  //     that specific step was about to run (it never did). Resuming via
  //     start_next_automation_step here would treat that never-executed step
  //     as done and walk straight past it -- so this case re-invokes
  //     execute_automation_step for the exact step instead, which is what
  //     actually runs its action before advancing the run normally.
  const { data: blockedRuns } = await supabase
    .from("automation_runs")
    .select("id, blocked_step_id, workspaces(status)")
    .eq("status", "running")
    .not("blocked_at", "is", null)
    .limit(BATCH_SIZE);
  let resumed = 0;
  for (const run of blockedRuns ?? []) {
    const workspaceStatus = (run.workspaces as unknown as { status?: string } | null)?.status;
    if (!isWorkspaceStatusOperational(workspaceStatus ?? "")) continue;
    if (run.blocked_step_id) {
      await supabase.rpc("execute_automation_step", { p_run_id: run.id, p_step_id: run.blocked_step_id });
    } else {
      await supabase.rpc("start_next_automation_step", { p_run_id: run.id });
    }
    resumed++;
  }

  return NextResponse.json({ processed, stillWaiting, deferred, blocked, resumed });
}

export const GET = withJobLogging("run-pending-automation-steps", handleGET);
