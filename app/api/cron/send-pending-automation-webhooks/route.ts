import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { withJobLogging } from "@/lib/cron/withJobLogging";
import { isWorkspaceStatusOperational } from "@/lib/workspace";

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
    .select("id, workspace_id, url, payload, attempts")
    .eq("status", "pending")
    .lte("next_attempt_at", nowIso)
    .order("next_attempt_at", { ascending: true })
    .limit(BATCH_SIZE);

  // A delivery can be queued from before the workspace was suspended -- it
  // must not fire an outbound webhook while the workspace is
  // non-operational, but it also must not be marked 'failed' (dropped for
  // good) or 'sent' (a false success). Left untouched at 'pending' with its
  // existing next_attempt_at, it's naturally retried by a later tick,
  // including after the workspace recovers to active.
  const workspaceIds = Array.from(new Set((pending ?? []).map((row) => row.workspace_id)));
  const { data: workspaceStatusRows } = workspaceIds.length
    ? await supabase.from("workspaces").select("id, status").in("id", workspaceIds)
    : { data: [] as { id: string; status: string }[] };
  const statusByWorkspaceId = new Map((workspaceStatusRows ?? []).map((w) => [w.id, w.status]));
  const operationalPending = (pending ?? []).filter((row) => isWorkspaceStatusOperational(statusByWorkspaceId.get(row.workspace_id) ?? "active"));
  const blocked = (pending?.length ?? 0) - operationalPending.length;
  if (blocked > 0) {
    console.log(`send-pending-automation-webhooks: leaving ${blocked} delivery(s) pending -- workspace not currently operational`);
  }

  let sent = 0;
  let failed = 0;
  for (const row of operationalPending) {
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

  return NextResponse.json({ sent, failed, blocked });
}

export const GET = withJobLogging("send-pending-automation-webhooks", handleGET);
