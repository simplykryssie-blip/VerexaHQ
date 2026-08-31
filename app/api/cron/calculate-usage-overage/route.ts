import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { createInvoiceItem } from "@/lib/stripe/client";

export const dynamic = "force-dynamic";

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

const RESOURCE_LABEL: Record<string, string> = {
  email: "emails",
  sms: "text messages",
  storage: "GB of storage",
};

// Runs monthly. compute_pending_usage_overage reads real usage from
// email_log/sms_log/attachments and returns only what's NEW since the last
// run (email/SMS delta-billed against a permanent one-time bucket; storage
// billed in full each run since it's a standing balance). Each row is
// charged via a Stripe invoice item that rolls into that workspace's next
// regular invoice, and the running total is only persisted after the Stripe
// call succeeds -- so a failed charge retries next month instead of being
// silently marked paid.
export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const { data: pending, error } = await supabase.rpc("compute_pending_usage_overage");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let billed = 0;
  let failed = 0;

  for (const row of pending ?? []) {
    if (!row.stripe_customer_id || row.amount_cents <= 0) continue;

    const result = await createInvoiceItem({
      customerId: row.stripe_customer_id,
      amountCents: row.amount_cents,
      currency: row.currency,
      description: `${row.new_billable_units.toLocaleString()} ${RESOURCE_LABEL[row.resource_type] ?? row.resource_type} over your plan's included amount`,
    });

    if (!result.ok) {
      failed += 1;
      continue;
    }

    await supabase.rpc("record_usage_overage_billed", {
      p_workspace_id: row.workspace_id,
      p_resource_type: row.resource_type,
      p_new_billed_units_total: row.new_billed_units_total,
    });
    billed += 1;
  }

  return NextResponse.json({ billed, failed, total: pending?.length ?? 0 });
}
