import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Lock, ShieldAlert, CreditCard, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { PlatformAdminTabs } from "../PlatformAdminTabs";

export const dynamic = "force-dynamic";

const SUB_STATUS_TONE: Record<string, BadgeTone> = {
  past_due: "warning",
  unpaid: "danger",
};

export default async function PlatformReviewQueuePage() {
  const supabase = createClient();
  const { data: isPlatformAdmin } = await supabase.rpc("is_platform_admin");

  if (!isPlatformAdmin) {
    return (
      <>
        <PageHeader title="Review Queue" />
        <div className="flex-1 px-8 py-6">
          <div className="rounded-2xl border border-border bg-surface shadow-soft">
            <EmptyState icon={Lock} message="This area is only available to Verexa platform admins." />
          </div>
        </div>
      </>
    );
  }

  const [{ data: failures }, { data: subscriptions }, { data: workspaces }] = await Promise.all([
    supabase
      .from("system_failure_log")
      .select("id, source, workspace_id, message, created_at, notified_at")
      .is("notified_at", null)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("workspace_subscriptions")
      .select("workspace_id, stripe_status, cancel_at_period_end, current_period_end"),
    supabase.from("workspaces").select("id, name, is_demo, is_platform_home"),
  ]);

  const realWorkspaceById = new Map((workspaces ?? []).filter((w) => !w.is_demo && !w.is_platform_home).map((w) => [w.id, w.name]));

  const needsAttention = (subscriptions ?? []).filter(
    (s) => realWorkspaceById.has(s.workspace_id) && (s.stripe_status === "past_due" || s.stripe_status === "unpaid")
  );
  const upcomingCancellations = (subscriptions ?? []).filter(
    (s) => realWorkspaceById.has(s.workspace_id) && s.stripe_status === "active" && s.cancel_at_period_end
  );

  const failureRows = (failures ?? []).filter((f) => !f.workspace_id || !((workspaces ?? []).find((w) => w.id === f.workspace_id)?.is_demo));
  const workspaceNameById = new Map((workspaces ?? []).map((w) => [w.id, w.name]));

  return (
    <>
      <PageHeader title="Review Queue" description="Everything that actually needs a decision from you -- not a status report, a to-do list." />
      <div className="flex-1 space-y-6 px-8 py-6">
        <PlatformAdminTabs active="review" />

        <div>
          <div className="mb-3 flex items-center gap-2">
            <CreditCard size={16} className="text-rose" />
            <h2 className="font-display text-sm font-semibold text-ink">Subscriptions needing attention</h2>
          </div>
          {needsAttention.length === 0 ? (
            <div className="rounded-2xl border border-border bg-surface shadow-soft">
              <EmptyState message="No subscriptions past due or unpaid." />
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-border bg-surface shadow-soft">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-surfaceMuted text-left text-xs uppercase tracking-wide text-muted">
                    <th className="px-5 py-3 font-medium">Workspace</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                    <th className="px-5 py-3 font-medium">Period end</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {needsAttention.map((s) => (
                    <tr key={s.workspace_id} className="transition-colors hover:bg-surfaceMuted">
                      <td className="px-5 py-3">
                        <Link href={`/platform-admin/${s.workspace_id}`} className="font-medium text-accent hover:underline">
                          {realWorkspaceById.get(s.workspace_id) ?? s.workspace_id}
                        </Link>
                      </td>
                      <td className="px-5 py-3">
                        <Badge tone={SUB_STATUS_TONE[s.stripe_status] ?? "neutral"} className="capitalize">
                          {s.stripe_status}
                        </Badge>
                      </td>
                      <td className="px-5 py-3 text-slate">{s.current_period_end ? new Date(s.current_period_end).toLocaleDateString() : "--"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div>
          <div className="mb-3 flex items-center gap-2">
            <RefreshCw size={16} className="text-violet" />
            <h2 className="font-display text-sm font-semibold text-ink">Upcoming cancellations</h2>
          </div>
          {upcomingCancellations.length === 0 ? (
            <div className="rounded-2xl border border-border bg-surface shadow-soft">
              <EmptyState message="No workspaces are scheduled to cancel." />
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-border bg-surface shadow-soft">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-surfaceMuted text-left text-xs uppercase tracking-wide text-muted">
                    <th className="px-5 py-3 font-medium">Workspace</th>
                    <th className="px-5 py-3 font-medium">Access ends</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {upcomingCancellations.map((s) => (
                    <tr key={s.workspace_id} className="transition-colors hover:bg-surfaceMuted">
                      <td className="px-5 py-3">
                        <Link href={`/platform-admin/${s.workspace_id}`} className="font-medium text-accent hover:underline">
                          {realWorkspaceById.get(s.workspace_id) ?? s.workspace_id}
                        </Link>
                      </td>
                      <td className="px-5 py-3 text-slate">{s.current_period_end ? new Date(s.current_period_end).toLocaleDateString() : "--"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div>
          <div className="mb-3 flex items-center gap-2">
            <ShieldAlert size={16} className="text-danger" />
            <h2 className="font-display text-sm font-semibold text-ink">Undigested system failures</h2>
          </div>
          {failureRows.length === 0 ? (
            <div className="rounded-2xl border border-border bg-surface shadow-soft">
              <EmptyState message="Nothing undigested." />
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
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {failureRows.map((f) => (
                    <tr key={f.id} className="transition-colors hover:bg-surfaceMuted">
                      <td className="whitespace-nowrap px-5 py-3 text-slate">{new Date(f.created_at).toLocaleString()}</td>
                      <td className="whitespace-nowrap px-5 py-3 font-mono text-xs text-slate">{f.source}</td>
                      <td className="whitespace-nowrap px-5 py-3 text-slate">
                        {f.workspace_id ? (workspaceNameById.get(f.workspace_id) ?? f.workspace_id) : <span className="text-muted">--</span>}
                      </td>
                      <td className="px-5 py-3 text-slate">{f.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-2 text-xs text-muted">
            The full failure history (including already-digested ones) and job queues are still on{" "}
            <Link href="/platform-admin/systems" className="font-medium text-accent hover:underline">
              Systems
            </Link>
            .
          </p>
        </div>
      </div>
    </>
  );
}
