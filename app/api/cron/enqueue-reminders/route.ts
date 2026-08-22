import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

// Scans invoices/signature requests/workflow stages for upcoming due dates
// and enqueues reminder jobs into notification_queue (drained separately by
// /api/cron/dispatch-notifications). See migration
// notification_preferences_and_reminders for the enqueue_reminder_notifications
// RPC this just triggers -- idempotent, safe to run on a schedule.
export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc("enqueue_reminder_notifications");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ enqueued: data });
}
