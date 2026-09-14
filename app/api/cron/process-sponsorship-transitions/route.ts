import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { withJobLogging } from "@/lib/cron/withJobLogging";

export const dynamic = "force-dynamic";

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

/**
 * Hourly sweep for released-staff sponsorship transitions (see
 * process_sponsorship_transition_reminders_and_expirations): sends the
 * day-3/day-1 email reminders, and once a transition's sponsorship_end_date
 * has actually arrived, ends the sponsor's access and either finalizes the
 * transition (personal billing already active) or suspends the released
 * user's personal workspace (billing was never set up in time). All of the
 * actual logic lives in the RPC -- this route only authenticates the cron
 * request and calls it, mirroring check-billing-cycles.
 */
async function handleGET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc("process_sponsorship_transition_reminders_and_expirations").maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, ...data });
}

export const GET = withJobLogging("process-sponsorship-transitions", handleGET);
