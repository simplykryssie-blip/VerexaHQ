import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { withJobLogging } from "@/lib/cron/withJobLogging";

export const dynamic = "force-dynamic";

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

// Scans invoices past their due_date and fires invoice.overdue automations.
// Idempotent via invoices.overdue_flagged_at -- see fire_invoice_overdue_automations,
// which only considers invoices where that's still null and sets it once
// fired, so an invoice stuck overdue for weeks fires exactly once.
async function handleGET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc("fire_invoice_overdue_automations");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ flagged: data });
}

export const GET = withJobLogging("check-overdue-invoices", handleGET);
