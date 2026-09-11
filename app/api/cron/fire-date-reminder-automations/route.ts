import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { withJobLogging } from "@/lib/cron/withJobLogging";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

// Date-field reminder triggers (engagement due date, quote expiration,
// client birthday) don't fire off an event -- they fire when today matches
// a computed target date. fire_date_reminder_automations() does that
// comparison and starts a run for every match; its own dedupe table
// (automation_date_reminders_sent) keeps a match from firing twice on the
// same calendar day even across multiple cron ticks.
async function handleGET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc("fire_date_reminder_automations");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ fired: data ?? 0 });
}

export const GET = withJobLogging("fire-date-reminder-automations", handleGET);
