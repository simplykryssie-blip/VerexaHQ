import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { withJobLogging } from "@/lib/cron/withJobLogging";

export const dynamic = "force-dynamic";

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

// Daily sweep: bills every non-free phone number due this month ($4.99,
// drawn from the workspace's SMS prepaid balance) and pauses any it
// couldn't cover. Also the retry path for a previously paused number --
// see bill_and_pause_phone_numbers for why it's safe to call every day
// instead of tracking a precise monthly schedule per number.
async function handleGET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc("bill_and_pause_phone_numbers");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const billed = (data ?? []).filter((r) => r.result === "billed").length;
  const paused = (data ?? []).filter((r) => r.result === "paused").length;
  return NextResponse.json({ ok: true, billed, paused });
}

export const GET = withJobLogging("bill-phone-numbers", handleGET);
