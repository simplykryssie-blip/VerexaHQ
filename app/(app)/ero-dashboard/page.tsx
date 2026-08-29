import Link from "next/link";
import { Users, Briefcase, Clock, Receipt, ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { getDashboardData } from "@/lib/dashboard/data";
import { computeTodaysPriorities } from "@/lib/dashboard/priorities";
import { getWorkspaceMemberWorkload } from "@/lib/workspaceStaff";
import { timeAgo } from "@/lib/timeAgo";
import { PageHeader } from "@/components/PageHeader";
import { KpiWidget } from "@/components/widgets/KpiWidget";
import { EngagementPipelineWidget } from "@/components/widgets/EngagementPipelineWidget";
import { PrioritiesWidget } from "@/components/widgets/PrioritiesWidget";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { Avatar } from "@/components/Avatar";
import type { WorkspaceMemberWorkload } from "@/lib/workspaceStaff";

export const dynamic = "force-dynamic";

export default async function EroDashboardPage() {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const supabase = createClient();
  const [data, { members }] = await Promise.all([
    getDashboardData(workspace.id),
    getWorkspaceMemberWorkload(supabase, workspace.id),
  ]);

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
      <PageHeader title="ERO Dashboard" description={`Team-wide workload and pipeline for ${workspace.name}.`} />

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
