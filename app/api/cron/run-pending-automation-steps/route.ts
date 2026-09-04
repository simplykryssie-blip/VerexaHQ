import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

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
export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const nowIso = new Date().toISOString();

  const { data: pending } = await supabase
    .from("automation_pending_steps")
    .select("id, run_id, automation_step_id, automation_steps(action_type)")
    .eq("status", "pending_delay")
    .lte("scheduled_for", nowIso)
    .order("scheduled_for", { ascending: true })
    .limit(BATCH_SIZE);

  const startedAt = Date.now();
  let processed = 0;
  let stillWaiting = 0;
  let deferred = 0;
  for (const row of pending ?? []) {
    if (Date.now() - startedAt > DEADLINE_MS) {
      deferred = (pending?.length ?? 0) - processed - stillWaiting;
      console.log(`run-pending-automation-steps: stopping early with ${deferred} row(s) left for the next tick`);
      break;
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

  return NextResponse.json({ processed, stillWaiting, deferred });
}
