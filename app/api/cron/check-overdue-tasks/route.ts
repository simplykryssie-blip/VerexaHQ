import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

// Scans tasks past their due_date and fires task.overdue automations.
// Idempotent via tasks.overdue_flagged_at -- see fire_task_overdue_automations,
// which only considers tasks where that's still null and sets it once fired,
// so a task stuck overdue for weeks fires exactly once, not every run.
export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc("fire_task_overdue_automations");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ flagged: data });
}
