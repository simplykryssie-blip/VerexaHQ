import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { ReportLayout } from "@/components/reports/ReportLayout";
import { FilterBar } from "@/components/reports/FilterBar";
import { SortableTable } from "@/components/reports/SortableTable";
import { buildReportTable, type ReportColumnDef } from "@/lib/reports/buildReportTable";
import { ExportButtons } from "@/components/reports/ExportButtons";
import { SimpleBarChart } from "@/components/reports/SimpleBarChart";
import { StaffFilterSelect } from "@/components/reports/StaffFilterSelect";
import { EmptyState } from "@/components/EmptyState";
import { Lock } from "lucide-react";
import { clientLabel } from "@/lib/documentEntityLabels";
import { Badge } from "@/components/ui/Badge";
import { ENGAGEMENT_STATUS_TONE, ENGAGEMENT_PRIORITY_TONE } from "@/lib/engagementStatus";
import { getWorkspaceStaff } from "@/lib/workspaceStaff";

export const dynamic = "force-dynamic";

type EngagementRow = {
  id: string;
  engagement_number: string | null;
  clientLabel: string;
  client_id: string;
  typeName: string;
  status: string;
  priority: string | null;
  open_date: string | null;
  completed_date: string | null;
  turnaroundDays: number | null;
  assignedStaffId: string | null;
  assignedStaffName: string | null;
};

export default async function EngagementsReportPage({
  searchParams,
}: {
  searchParams: { q?: string; from?: string; to?: string; staff?: string };
}) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const supabase = createClient();
  const { data: canView } = await supabase.rpc("has_permission", { p_workspace_id: workspace.id, p_permission_key: "engagements.view" });
  if (!canView) {
    return (
      <ReportLayout title="Engagements">
        <EmptyState icon={Lock} message="You don't have permission to view engagement reports." />
      </ReportLayout>
    );
  }

  const [{ data: engagements }, staff] = await Promise.all([
    supabase
      .from("engagements")
      .select(
        "id, engagement_number, status, priority, open_date, completed_date, client_id, assigned_staff_id, clients(first_name, last_name, business_name, client_type), services(name)"
      )
      .eq("workspace_id", workspace.id)
      .order("open_date", { ascending: false }),
    getWorkspaceStaff(supabase, workspace.id),
  ]);
  const staffOptions = staff.map((s) => ({ id: s.user_id, display_name: s.display_name }));
  const staffNameById = new Map(staffOptions.map((s) => [s.id, s.display_name]));

  let rows: EngagementRow[] = (engagements ?? []).map((e) => {
    const openMs = e.open_date ? new Date(e.open_date).getTime() : null;
    const completedMs = e.completed_date ? new Date(e.completed_date).getTime() : null;
    return {
      id: e.id,
      engagement_number: e.engagement_number,
      clientLabel: clientLabel(e.clients as never),
      client_id: e.client_id,
      typeName: (e.services as unknown as { name?: string } | null)?.name ?? "--",
      status: e.status,
      priority: e.priority,
      open_date: e.open_date,
      completed_date: e.completed_date,
      turnaroundDays: completedMs && openMs ? Math.round((completedMs - openMs) / 86_400_000) : null,
      assignedStaffId: e.assigned_staff_id,
      assignedStaffName: e.assigned_staff_id ? (staffNameById.get(e.assigned_staff_id) ?? "Unknown") : null,
    };
  });

  if (searchParams.from) rows = rows.filter((r) => (r.open_date ?? "") >= searchParams.from!);
  if (searchParams.to) rows = rows.filter((r) => (r.open_date ?? "") <= searchParams.to!);
  if (searchParams.q) {
    const q = searchParams.q.toLowerCase();
    rows = rows.filter((r) => r.clientLabel.toLowerCase().includes(q) || r.engagement_number?.toLowerCase().includes(q));
  }
  if (searchParams.staff === "__unassigned__") rows = rows.filter((r) => !r.assignedStaffId);
  else if (searchParams.staff) rows = rows.filter((r) => r.assignedStaffId === searchParams.staff);

  const byStatus = new Map<string, number>();
  for (const r of rows) byStatus.set(r.status, (byStatus.get(r.status) ?? 0) + 1);
  const chartData = Array.from(byStatus.entries()).map(([label, value]) => ({ label, value }));

  const completedWithTurnaround = rows.filter((r) => r.turnaroundDays !== null);
  const avgTurnaround =
    completedWithTurnaround.length > 0
      ? Math.round(completedWithTurnaround.reduce((sum, r) => sum + (r.turnaroundDays ?? 0), 0) / completedWithTurnaround.length)
      : null;

  const columnDefs: ReportColumnDef<EngagementRow>[] = [
    {
      key: "client",
      label: "Client",
      render: (r) => (
        <Link href={`/engagements/${r.id}`} className="font-medium text-accent hover:underline">
          {r.clientLabel}
        </Link>
      ),
      sortValue: (r) => r.clientLabel,
    },
    { key: "number", label: "Engagement", render: (r) => r.engagement_number ?? "--", sortValue: (r) => r.engagement_number ?? "" },
    { key: "type", label: "Type", render: (r) => r.typeName, sortValue: (r) => r.typeName },
    {
      key: "status",
      label: "Status",
      render: (r) => (
        <Badge tone={ENGAGEMENT_STATUS_TONE[r.status] ?? "neutral"} className="capitalize">
          {r.status}
        </Badge>
      ),
      sortValue: (r) => r.status,
    },
    {
      key: "priority",
      label: "Priority",
      render: (r) =>
        r.priority ? (
          <Badge tone={ENGAGEMENT_PRIORITY_TONE[r.priority] ?? "neutral"}>{r.priority}</Badge>
        ) : (
          "--"
        ),
      sortValue: (r) => r.priority ?? "",
    },
    { key: "opened", label: "Opened", render: (r) => (r.open_date ? new Date(r.open_date).toLocaleDateString() : "--"), sortValue: (r) => r.open_date ?? "" },
    {
      key: "assignedStaff",
      label: "Assigned staff",
      render: (r) => <span className={r.assignedStaffName ? "text-slate" : "text-muted"}>{r.assignedStaffName ?? "Unassigned"}</span>,
      sortValue: (r) => r.assignedStaffName ?? "",
    },
    {
      key: "turnaround",
      label: "Turnaround (days)",
      align: "right",
      render: (r) => r.turnaroundDays ?? "--",
      sortValue: (r) => r.turnaroundDays ?? -1,
    },
  ];

  const { columns, tableRows } = buildReportTable(rows, columnDefs);

  const csvRows = rows.map((r) => ({
    Client: r.clientLabel,
    Engagement: r.engagement_number ?? "",
    Type: r.typeName,
    Status: r.status,
    Priority: r.priority ?? "",
    Opened: r.open_date ?? "",
    "Assigned staff": r.assignedStaffName ?? "Unassigned",
    "Turnaround (days)": r.turnaroundDays ?? "",
  }));

  return (
    <ReportLayout
      title="Engagements"
      description={`Engagement volume by status and type${avgTurnaround !== null ? ` -- average turnaround ${avgTurnaround} days.` : "."}`}
      filters={
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[280px] flex-1">
            <FilterBar reportKey="engagements" searchPlaceholder="Search client or engagement..." />
          </div>
          <div className="rounded-2xl border border-border bg-surface shadow-soft p-4">
            <StaffFilterSelect staffOptions={staffOptions} />
          </div>
        </div>
      }
      actions={<ExportButtons rows={csvRows} filename="engagements-report" />}
    >
      {chartData.length > 0 && (
        <div className="rounded-2xl border border-border bg-surface shadow-soft p-5">
          <h2 className="text-sm font-semibold text-ink">By status</h2>
          <div className="mt-3">
            <SimpleBarChart data={chartData} />
          </div>
        </div>
      )}
      <SortableTable columns={columns} rows={tableRows} emptyMessage="No engagements match this filter." />
    </ReportLayout>
  );
}
