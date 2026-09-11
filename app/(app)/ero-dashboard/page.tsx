import Link from "next/link";
import { Users, Briefcase, Clock, Receipt, ArrowRight, Building2, Lock, Wallet } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { isEroManagementTier } from "@/lib/workspaceCapabilities";
import { CHILD_RELATIONSHIP_TYPES_BY_WORKSPACE_TYPE } from "@/lib/firmConnections";
import { getDashboardData } from "@/lib/dashboard/data";
import { computeTodaysPriorities } from "@/lib/dashboard/priorities";
import { getWorkspaceMemberWorkload } from "@/lib/workspaceStaff";
import { timeAgo } from "@/lib/timeAgo";
import { PageHero, HeroHighlight } from "@/components/ui/PageHero";
import { KpiWidget } from "@/components/widgets/KpiWidget";
import { EngagementPipelineWidget } from "@/components/widgets/EngagementPipelineWidget";
import { PrioritiesWidget } from "@/components/widgets/PrioritiesWidget";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { Avatar } from "@/components/Avatar";
import { EmptyState } from "@/components/EmptyState";
import { StatTile } from "@/components/ui/StatTile";
import type { WorkspaceMemberWorkload } from "@/lib/workspaceStaff";

function money(n: number | null | undefined) {
  return `$${(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

type PendingPayoutRow = { id: string; connectionId: string; firmName: string; period_start: string; period_end: string; amount_owed_to_ptin: number };

export const dynamic = "force-dynamic";

export default async function EroDashboardPage() {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const supabase = createClient();
  // This is a firm-wide rollup of every staff member's workload plus
  // overdue invoices -- the same category of data the near-identical
  // Team Performance/Staff Productivity reports already gate on
  // engagements.view, so this page shouldn't be the one place that skips it.
  const { data: canView } = await supabase.rpc("has_permission", { p_workspace_id: workspace.id, p_permission_key: "engagements.view" });
  if (!canView) {
    return (
      <>
        <PageHero
          icon={Building2}
          tone="violet"
          heading={
            <>
              Your <HeroHighlight>ERO dashboard</HeroHighlight>.
            </>
          }
          subtitle={`Team-wide workload and pipeline for ${workspace.name}.`}
        />
        <div className="flex-1 px-8 py-6">
          <EmptyState icon={Lock} message="You don't have permission to view the ERO dashboard." />
        </div>
      </>
    );
  }

  // Connected-partner financials are a step beyond plain workload/pipeline
  // visibility -- gated on the same permission the Firms pages already
  // require, so this rollup doesn't become a second, unguarded door to
  // another firm's payout numbers.
  const { data: canViewFirms } = await supabase.rpc("has_permission", { p_workspace_id: workspace.id, p_permission_key: "firm_connections.manage" });
  const childRelationshipTypes = CHILD_RELATIONSHIP_TYPES_BY_WORKSPACE_TYPE[workspace.workspace_type] ?? [];
  const showPartnerPayouts = isEroManagementTier(workspace) && Boolean(canViewFirms) && childRelationshipTypes.length > 0;

  const [data, { members }, { data: connectedFirms }] = await Promise.all([
    getDashboardData(workspace.id),
    getWorkspaceMemberWorkload(supabase, workspace.id),
    showPartnerPayouts
      ? supabase.rpc("get_ero_connected_partners", { p_workspace_id: workspace.id, p_relationship_types: childRelationshipTypes })
      : Promise.resolve({ data: [] as { connection_id: string; name: string; status: string }[] }),
  ]);

  const { data: pendingPayouts } = showPartnerPayouts
    ? await supabase
        .from("firm_payouts")
        .select("id, connection_id, period_start, period_end, amount_owed_to_ptin")
        .eq("parent_workspace_id", workspace.id)
        .eq("status", "pending")
        .order("period_start", { ascending: false })
    : { data: [] as { id: string; connection_id: string; period_start: string; period_end: string; amount_owed_to_ptin: number }[] };

  const firmNameByConnectionId = new Map((connectedFirms ?? []).map((f) => [f.connection_id, f.name]));
  const pendingPayoutRows: PendingPayoutRow[] = (pendingPayouts ?? []).map((p) => ({
    id: p.id,
    connectionId: p.connection_id,
    firmName: firmNameByConnectionId.get(p.connection_id) ?? "Unknown firm",
    period_start: p.period_start,
    period_end: p.period_end,
    amount_owed_to_ptin: p.amount_owed_to_ptin,
  }));
  const totalPendingOwed = pendingPayoutRows.reduce((sum, p) => sum + p.amount_owed_to_ptin, 0);
  const activePartnerCount = (connectedFirms ?? []).filter((f) => f.status === "active").length;

  // A wider "attention required" window than a single preparer's daily feed
  // (PrioritiesWidget's own default of 5) -- this is the firm-wide view, so
  // it should surface more of what's piling up across the whole team.
  const priorities = computeTodaysPriorities(data, 10);

  const activeMembers = members.filter((m) => m.status === "active");
  const workload = [...activeMembers].sort(
    (a, b) => b.openTaskCount + b.assignedClientCount - (a.openTaskCount + a.assignedClientCount)
  );

  const workloadColumns: DataTableColumn<WorkspaceMemberWorkload>[] = [
    {
      key: "name",
      header: "Name",
      render: (m) => (
        <Link href={`/settings/users/${m.user_id}`} className="flex items-center gap-2 hover:underline">
          <Avatar name={m.display_name} url={m.avatar_url} size="sm" />
          <span className="text-slate">{m.display_name ?? "--"}</span>
        </Link>
      ),
    },
    { key: "role", header: "Role", render: (m) => <span className="text-slate">{m.role_name ?? "--"}</span> },
    {
      key: "clients",
      header: "Assigned clients",
      render: (m) => <span className="text-slate">{m.assignedClientCount}</span>,
    },
    {
      key: "tasks",
      header: "Open tasks",
      render: (m) => (
        <span className={m.openTaskCount > 0 ? "font-medium text-ink" : "text-slate"}>{m.openTaskCount}</span>
      ),
    },
    {
      key: "lastActivity",
      header: "Last Activity",
      render: (m) => <span className="text-muted">{timeAgo(m.last_seen_at)}</span>,
    },
  ];

  return (
    <>
      <PageHero
        icon={Building2}
        tone="violet"
        heading={
          <>
            Your <HeroHighlight>ERO dashboard</HeroHighlight>.
          </>
        }
        subtitle={`Team-wide workload and pipeline for ${workspace.name}.`}
      />

      <div className="flex-1 px-8 py-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiWidget title="Team members" value={String(activeMembers.length)} icon={Users} chip="accent" reportHref="/settings/users" />
          <KpiWidget title="Open engagements" value={String(data.kpis.openEngagements)} icon={Briefcase} chip="violet" reportHref="/engagements" />
          <KpiWidget
            title="Overdue tasks"
            value={String(data.overdueTasks.length)}
            icon={Clock}
            chip={data.overdueTasks.length > 0 ? "rose" : "emerald"}
            tone={data.overdueTasks.length > 0 ? "danger" : "default"}
          />
          <KpiWidget
            title="Overdue invoices"
            value={String(data.overdueInvoices.length)}
            icon={Receipt}
            chip={data.overdueInvoices.length > 0 ? "amber" : "emerald"}
            tone={data.overdueInvoices.length > 0 ? "warning" : "default"}
            reportHref="/billing"
          />
        </div>

        <div className="mt-4">
          <EngagementPipelineWidget stages={data.engagementPipeline} />
        </div>

        {showPartnerPayouts && (
          <div className="mt-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-base font-semibold text-ink">Partner Payouts</h2>
              <Link href="/firms" className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline">
                View all firms <ArrowRight size={12} aria-hidden="true" />
              </Link>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <StatTile icon={Building2} tone="accent" label="Active partners" value={activePartnerCount} />
              <StatTile icon={Wallet} tone="amber" label="Pending payouts" value={pendingPayoutRows.length} />
              <StatTile icon={Wallet} tone="rose" label="Total pending owed" value={money(totalPendingOwed)} />
            </div>
            {pendingPayoutRows.length > 0 && (
              <div className="mt-3 overflow-hidden rounded-2xl border border-border bg-surface shadow-soft">
                <table className="w-full text-sm">
                  <thead className="bg-surfaceMuted text-xs uppercase tracking-wide text-muted">
                    <tr>
                      <th className="px-3 py-2 text-left">Firm</th>
                      <th className="px-3 py-2 text-left">Period</th>
                      <th className="px-3 py-2 text-right">Owed</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {pendingPayoutRows.map((p) => (
                      <tr key={p.id}>
                        <td className="px-3 py-2 text-slate">{p.firmName}</td>
                        <td className="px-3 py-2 text-muted">
                          {p.period_start} - {p.period_end}
                        </td>
                        <td className="px-3 py-2 text-right font-medium text-ink">{money(p.amount_owed_to_ptin)}</td>
                        <td className="px-3 py-2 text-right">
                          <Link href={`/firms/${p.connectionId}`} className="text-xs font-medium text-accent hover:underline">
                            View
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <PrioritiesWidget items={priorities} />
          <div>
            <h2 className="font-display text-base font-semibold text-ink">Team Workload</h2>
            <div className="mt-3 overflow-hidden rounded-2xl border border-border bg-surface shadow-soft">
              <DataTable columns={workloadColumns} rows={workload} emptyMessage="No active team members yet." />
            </div>
            <Link href="/settings/users" className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline">
              View full team <ArrowRight size={12} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
