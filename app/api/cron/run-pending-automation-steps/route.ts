import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BATCH_SIZE = 50;

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
export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const nowIso = new Date().toISOString();

  const { data: pending } = await supabase
    .from("automation_pending_steps")
    .select("id, run_id, automation_step_id")
    .eq("status", "pending_delay")
    .lte("scheduled_for", nowIso)
    .order("scheduled_for", { ascending: true })
    .limit(BATCH_SIZE);

  let processed = 0;
  let stillWaiting = 0;
  for (const row of pending ?? []) {
    const { data: shouldAdvance } = await supabase.rpc("should_advance_wait_until_step", { p_pending_id: row.id });
    if (shouldAdvance === false) {
      stillWaiting++;
      continue;
    }
    await supabase.rpc("execute_automation_step", { p_run_id: row.run_id, p_step_id: row.automation_step_id });
    await supabase.from("automation_pending_steps").delete().eq("id", row.id);
    processed++;
  }

  return NextResponse.json({ processed, stillWaiting });
}
