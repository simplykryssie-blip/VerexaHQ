import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { cancelSubscription, retrieveSubscriptionForProvisioning } from "@/lib/stripe/client";
import { withJobLogging } from "@/lib/cron/withJobLogging";

export const dynamic = "force-dynamic";

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

const ARCHIVE_AFTER_DAYS = 30;
const PERMANENTLY_ARCHIVE_AFTER_DAYS = 90;

/**
 * Day 30/90 archive lifecycle, run daily. Both thresholds are measured from
 * suspended_at (when nonpayment suspension began), not archived_at -- the
 * locked lifecycle (ACTIVE -> PAST_DUE -> SUSPENDED -> ARCHIVED ->
 * PERMANENTLY_ARCHIVED) counts both Day 30 and Day 90 from that same
 * origin. A workspace with no suspended_at (suspended before this column
 * existed, or suspended for a reason other than nonpayment before this
 * migration) is never archive-eligible -- the safe default when there's no
 * real suspension start time to measure from.
 *
 * Idempotent: each transition is guarded by .eq("status", <expected prior
 * status>), so a repeated tick after a transition already happened is a
 * no-op rather than a duplicate transition, a second forfeiture, or a
 * second Stripe cancellation.
 */
async function handleGET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const now = new Date();
  const archiveCutoff = new Date(now.getTime() - ARCHIVE_AFTER_DAYS * 86400000).toISOString();
  const permanentCutoff = new Date(now.getTime() - PERMANENTLY_ARCHIVE_AFTER_DAYS * 86400000).toISOString();

  const results = { archived: 0, permanentlyArchived: 0 };

  const { data: toArchive } = await supabase
    .from("workspaces")
    .select("id")
    .eq("status", "suspended")
    .not("suspended_at", "is", null)
    .lte("suspended_at", archiveCutoff);

  for (const w of toArchive ?? []) {
    const { error: updateError } = await supabase
      .from("workspaces")
      .update({ status: "archived", archived_at: now.toISOString() })
      .eq("id", w.id)
      .eq("status", "suspended");
    if (updateError) continue;

    // Forfeit remaining prepaid balance in every category -- no partial
    // credit, no carryover. Free-allowance columns are untouched (never
    // paid for, nothing to forfeit).
    const { data: meters } = await supabase
      .from("workspace_usage_meters")
      .select("resource_type, prepaid_balance")
      .eq("workspace_id", w.id)
      .gt("prepaid_balance", 0);

    for (const meter of meters ?? []) {
      await supabase.from("workspace_usage_ledger").insert({
        workspace_id: w.id,
        resource_type: meter.resource_type,
        entry_type: "ARCHIVE_FORFEITURE",
        units: -meter.prepaid_balance,
        metadata: { reason: "workspace archived after 30 days suspended for nonpayment" },
      });
    }
    await supabase.from("workspace_usage_meters").update({ prepaid_balance: 0 }).eq("workspace_id", w.id).gt("prepaid_balance", 0);

    results.archived += 1;
  }

  const { data: toPermanentlyArchive } = await supabase
    .from("workspaces")
    .select("id, workspace_subscriptions(stripe_subscription_id)")
    .eq("status", "archived")
    .not("suspended_at", "is", null)
    .lte("suspended_at", permanentCutoff);

  for (const w of toPermanentlyArchive ?? []) {
    const stripeSubscriptionId = (w.workspace_subscriptions as unknown as { stripe_subscription_id: string | null } | null)?.stripe_subscription_id;

    if (stripeSubscriptionId) {
      const current = await retrieveSubscriptionForProvisioning(stripeSubscriptionId);
      const alreadyCanceled = current.ok && current.data.status === "canceled";
      if (!alreadyCanceled) {
        const cancel = await cancelSubscription(stripeSubscriptionId);
        if (!cancel.ok) {
          // Leave it in 'archived' and retry next tick rather than
          // transitioning to permanently_archived with a still-live
          // subscription capable of generating further charges.
          continue;
        }
      }
    }

    const { error: updateError } = await supabase
      .from("workspaces")
      .update({ status: "permanently_archived", permanently_archived_at: now.toISOString() })
      .eq("id", w.id)
      .eq("status", "archived");
    if (!updateError) results.permanentlyArchived += 1;
  }

  return NextResponse.json({ ok: true, ...results });
}

export const GET = withJobLogging("process-workspace-archive-lifecycle", handleGET);
