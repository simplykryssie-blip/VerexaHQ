import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { withJobLogging } from "@/lib/cron/withJobLogging";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BATCH_SIZE = 50;
const MAX_ATTEMPTS = 5;

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

// execute_automation_step can't make an HTTP request itself (it's pure SQL),
// so a "webhook" step only enqueues into automation_webhook_deliveries --
// this drains that queue the same way dispatch-notifications drains
// notification_queue, but actually performs the fetch() since only Next.js
// has a real HTTP client. Failed deliveries retry with backoff up to
// MAX_ATTEMPTS before being marked permanently failed.
async function handleGET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const nowIso = new Date().toISOString();

  const { data: pending } = await supabase
    .from("automation_webhook_deliveries")
    .select("id, url, payload, attempts")
    .eq("status", "pending")
    .lte("next_attempt_at", nowIso)
    .order("next_attempt_at", { ascending: true })
    .limit(BATCH_SIZE);

  let sent = 0;
  let failed = 0;
  for (const row of pending ?? []) {
    try {
      const res = await fetch(row.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(row.payload),
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) throw new Error(`Webhook endpoint returned ${res.status}`);
      await supabase.from("automation_webhook_deliveries").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", row.id);
      sent++;
    } catch (error) {
      const attempts = row.attempts + 1;
      const message = error instanceof Error ? error.message : "Unknown error";
      if (attempts >= MAX_ATTEMPTS) {
        await supabase.from("automation_webhook_deliveries").update({ status: "failed", attempts, last_error: message }).eq("id", row.id);
      } else {
        await supabase
          .from("automation_webhook_deliveries")
          .update({ attempts, last_error: message, next_attempt_at: new Date(Date.now() + attempts * 5 * 60 * 1000).toISOString() })
          .eq("id", row.id);
      }
      failed++;
    }
  }

  return NextResponse.json({ sent, failed });
}

export const GET = withJobLogging("send-pending-automation-webhooks", handleGET);
