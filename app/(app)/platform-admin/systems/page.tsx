import { createClient } from "@/lib/supabase/server";
import { Lock, ShieldAlert, ShieldEllipsis, KeyRound } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { WORKSPACE_STATUS_TONE } from "@/lib/workspaceStatus";
import { PlatformAdminTabs } from "../PlatformAdminTabs";
import type { BadgeTone } from "@/components/ui/Badge";

// A generic pending/processing/done/failed vocabulary shared loosely across
// the cron job queues below -- falls back to neutral for anything queue-specific.
const QUEUE_STATUS_TONE: Record<string, BadgeTone> = {
  pending: "warning",
  processing: "accent",
  processed: "success",
  sent: "success",
  completed: "success",
  failed: "danger",
};
import { SystemCredentialsManager } from "./SystemCredentialsManager";

export const dynamic = "force-dynamic";

const FAILURE_PAGE_SIZE = 100;

function statusCounts(rows: { status: string }[]) {
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.status, (counts.get(r.status) ?? 0) + 1);
  return counts;
}

export default async function PlatformAdminSystemsPage() {
  const supabase = createClient();
  const [{ data: isPlatformIt }, { data: isPlatformAdmin }] = await Promise.all([
    supabase.rpc("is_platform_it"),
    supabase.rpc("is_platform_admin"),
  ]);

  if (!isPlatformIt) {
    return (
      <>
        <PageHeader title="Systems" />
        <div className="flex-1 px-8 py-6">
          <div className="rounded-2xl border border-border bg-surface shadow-soft">
            <EmptyState icon={Lock} message="This area is only available to Verexa platform admins and IT." />
          </div>
        </div>
      </>
    );
  }

  const [
    { data: failures },
    { data: workspaces },
    { data: calendarJobs },
    { data: notificationJobs },
    { data: portalInviteJobs },
    { data: engagementLetterJobs },
    { data: webhookJobs },
    { data: credentials },
  ] = await Promise.all([
    supabase
      .from("system_failure_log")
      .select("id, source, workspace_id, message, context, created_at, notified_at")
      .order("created_at", { ascending: false })
      .limit(FAILURE_PAGE_SIZE),
    supabase.from("workspaces").select("id, name, workspace_type, status, created_at").order("created_at", { ascending: false }),
    supabase.from("calendar_sync_queue").select("status"),
    supabase.from("notification_queue").select("status"),
    supabase.from("pending_portal_invites").select("status"),
    supabase.from("pending_engagement_letter_sends").select("status"),
    supabase.from("automation_webhook_deliveries").select("status"),
    supabase.from("platform_system_credentials").select("id, system_name, username, notes, updated_at").order("system_name"),
  ]);

  const workspaceIds = Array.from(new Set((failures ?? []).map((f) => f.workspace_id).filter((id): id is string => Boolean(id))));
  const failureWorkspaceNameById = new Map((workspaces ?? []).filter((w) => workspaceIds.includes(w.id)).map((w) => [w.id, w.name]));

  const failureRows = failures ?? [];
  const unnotifiedCount = failureRows.filter((f) => !f.notified_at).length;

  const calendarCounts = statusCounts(calendarJobs ?? []);
  const notificationCounts = statusCounts(notificationJobs ?? []);
  const portalInviteCounts = statusCounts(portalInviteJobs ?? []);
  const engagementLetterCounts = statusCounts(engagementLetterJobs ?? []);
  const webhookCounts = statusCounts(webhookJobs ?? []);

  return (
    <>
      <PageHeader
        title="Systems"
        description="System health, error logs, job queues, and credentials for the systems that run the CRM -- not billing or revenue."
      />
      <div className="flex-1 space-y-6 px-8 py-6">
        {isPlatformAdmin && <PlatformAdminTabs active="systems" />}

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-2xl border border-border bg-surface shadow-soft p-4">
            <p className="text-xs uppercase tracking-wide text-muted">System failures shown</p>
            <p className="mt-1 text-2xl font-semibold text-ink">{failureRows.length}</p>
          </div>
          <div className="rounded-2xl border border-border bg-surface shadow-soft p-4">
            <p className="text-xs uppercase tracking-wide text-muted">Not yet digested</p>
            <p className="mt-1 text-2xl font-semibold text-ink">{unnotifiedCount}</p>
          </div>
          <div className="rounded-2xl border border-border bg-surface shadow-soft p-4">
            <p className="text-xs uppercase tracking-wide text-muted">Calendar sync pending</p>
            <p className="mt-1 text-2xl font-semibold text-ink">{calendarCounts.get("pending") ?? 0}</p>
          </div>
          <div className="rounded-2xl border border-border bg-surface shadow-soft p-4">
            <p className="text-xs uppercase tracking-wide text-muted">Notifications pending</p>
            <p className="mt-1 text-2xl font-semibold text-ink">{notificationCounts.get("pending") ?? 0}</p>
          </div>
        </div>

        <div>
          <h3 className="mb-1 flex items-center gap-1.5 font-display text-sm font-semibold text-ink">
            <KeyRound size={14} /> Credentials
          </h3>
          <p className="mb-3 text-xs text-muted">
            Logins for the systems Verexa itself depends on (Stripe, Resend, Supabase, Vercel, domains, etc.) -- encrypted at rest, revealed only on
            demand.
          </p>
          <SystemCredentialsManager credentials={credentials ?? []} />
        </div>

        <div>
          <h3 className="mb-3 font-display text-sm font-semibold text-ink">Job queues</h3>
          <p className="mb-3 text-xs text-muted">
            Counts by status only -- for the full run history of what the cron workers actually did, check Vercel&apos;s function logs. A queue with a
            growing &quot;pending&quot; count that isn&apos;t shrinking on refresh is exactly what the stale-queue check below watches for.
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-2xl border border-border bg-surface shadow-soft p-4">
              <p className="text-xs font-medium text-ink">Calendar sync queue</p>
              <ul className="mt-2 space-y-1 text-sm text-slate">
                {calendarCounts.size === 0 ? (
                  <li className="text-muted">Empty.</li>
                ) : (
                  Array.from(calendarCounts.entries()).map(([status, count]) => (
                    <li key={status} className="flex items-center justify-between">
                      <Badge tone={QUEUE_STATUS_TONE[status] ?? "neutral"} className="capitalize">
                        {status}
                      </Badge>
                      <span className="font-medium text-ink">{count}</span>
                    </li>
                  ))
                )}
              </ul>
            </div>
            <div className="rounded-2xl border border-border bg-surface shadow-soft p-4">
              <p className="text-xs font-medium text-ink">Notification queue</p>
              <ul className="mt-2 space-y-1 text-sm text-slate">
                {notificationCounts.size === 0 ? (
                  <li className="text-muted">Empty.</li>
                ) : (
                  Array.from(notificationCounts.entries()).map(([status, count]) => (
                    <li key={status} className="flex items-center justify-between">
                      <Badge tone={QUEUE_STATUS_TONE[status] ?? "neutral"} className="capitalize">
                        {status}
                      </Badge>
                      <span className="font-medium text-ink">{count}</span>
                    </li>
                  ))
                )}
              </ul>
            </div>
            <div className="rounded-2xl border border-border bg-surface shadow-soft p-4">
              <p className="text-xs font-medium text-ink">Portal invite queue</p>
              <ul className="mt-2 space-y-1 text-sm text-slate">
                {portalInviteCounts.size === 0 ? (
                  <li className="text-muted">Empty.</li>
                ) : (
                  Array.from(portalInviteCounts.entries()).map(([status, count]) => (
                    <li key={status} className="flex items-center justify-between">
                      <Badge tone={QUEUE_STATUS_TONE[status] ?? "neutral"} className="capitalize">
                        {status}
                      </Badge>
                      <span className="font-medium text-ink">{count}</span>
                    </li>
                  ))
                )}
              </ul>
            </div>
            <div className="rounded-2xl border border-border bg-surface shadow-soft p-4">
              <p className="text-xs font-medium text-ink">Engagement letter send queue</p>
              <ul className="mt-2 space-y-1 text-sm text-slate">
                {engagementLetterCounts.size === 0 ? (
                  <li className="text-muted">Empty.</li>
                ) : (
                  Array.from(engagementLetterCounts.entries()).map(([status, count]) => (
                    <li key={status} className="flex items-center justify-between">
                      <Badge tone={QUEUE_STATUS_TONE[status] ?? "neutral"} className="capitalize">
                        {status}
                      </Badge>
                      <span className="font-medium text-ink">{count}</span>
                    </li>
                  ))
                )}
              </ul>
            </div>
            <div className="rounded-2xl border border-border bg-surface shadow-soft p-4">
              <p className="text-xs font-medium text-ink">Automation webhook queue</p>
              <ul className="mt-2 space-y-1 text-sm text-slate">
                {webhookCounts.size === 0 ? (
                  <li className="text-muted">Empty.</li>
                ) : (
                  Array.from(webhookCounts.entries()).map(([status, count]) => (
                    <li key={status} className="flex items-center justify-between">
                      <Badge tone={QUEUE_STATUS_TONE[status] ?? "neutral"} className="capitalize">
                        {status}
                      </Badge>
                      <span className="font-medium text-ink">{count}</span>
                    </li>
                  ))
                )}
              </ul>
            </div>
          </div>
        </div>

        <div>
          <h3 className="mb-3 font-display text-sm font-semibold text-ink">System failures</h3>
          <p className="mb-3 text-xs text-muted">
            Failures nobody outside Verexa could fix -- missing templates/env vars, storage or DB errors, Resend outages or key issues. Also emailed as a
            digest to failedsystem@verexahq.com every 20 minutes.
          </p>
          {failureRows.length === 0 ? (
            <div className="rounded-2xl border border-border bg-surface shadow-soft">
              <EmptyState icon={ShieldAlert} message="No system failures logged." />
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-border bg-surface shadow-soft">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-surfaceMuted text-left text-xs uppercase tracking-wide text-muted">
                    <th className="px-5 py-3 font-medium">When</th>
                    <th className="px-5 py-3 font-medium">Source</th>
                    <th className="px-5 py-3 font-medium">Workspace</th>
                    <th className="px-5 py-3 font-medium">Message</th>
                    <th className="px-5 py-3 font-medium">Digest</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {failureRows.map((f) => (
                    <tr key={f.id} className="transition-colors hover:bg-surfaceMuted">
                      <td className="whitespace-nowrap px-5 py-3 text-slate">{new Date(f.created_at).toLocaleString()}</td>
                      <td className="whitespace-nowrap px-5 py-3 font-mono text-xs text-slate">{f.source}</td>
                      <td className="whitespace-nowrap px-5 py-3 text-slate">
                        {f.workspace_id ? (failureWorkspaceNameById.get(f.workspace_id) ?? f.workspace_id) : <span className="text-muted">--</span>}
                      </td>
                      <td className="px-5 py-3 text-slate">{f.message}</td>
                      <td className="whitespace-nowrap px-5 py-3">
                        {f.notified_at ? <Badge tone="neutral">Sent</Badge> : <Badge tone="warning">Pending</Badge>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div>
          <h3 className="mb-3 font-display text-sm font-semibold text-ink">Workspaces</h3>
          <p className="mb-3 text-xs text-muted">For identifying which workspace a report or error affects -- no subscription or billing detail here.</p>
          {!workspaces || workspaces.length === 0 ? (
            <div className="rounded-2xl border border-border bg-surface shadow-soft">
              <EmptyState icon={ShieldEllipsis} message="No workspaces yet." />
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-border bg-surface shadow-soft">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-surfaceMuted text-left text-xs uppercase tracking-wide text-muted">
                    <th className="px-5 py-3 font-medium">Workspace</th>
                    <th className="px-5 py-3 font-medium">Type</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                    <th className="px-5 py-3 font-medium">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {workspaces.map((w) => (
                    <tr key={w.id} className="transition-colors hover:bg-surfaceMuted">
                      <td className="px-5 py-3 text-slate">{w.name}</td>
                      <td className="px-5 py-3 text-slate">{w.workspace_type}</td>
                      <td className="px-5 py-3">
                        <Badge tone={WORKSPACE_STATUS_TONE[w.status] ?? "neutral"} className="capitalize">
                          {w.status}
                        </Badge>
                      </td>
                      <td className="px-5 py-3 text-slate">{new Date(w.created_at).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
