import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { getWorkspaceStaff } from "@/lib/workspaceStaff";
import { ReportLayout } from "@/components/reports/ReportLayout";
import { SortableTable } from "@/components/reports/SortableTable";
import { buildReportTable, type ReportColumnDef } from "@/lib/reports/buildReportTable";
import { ExportButtons } from "@/components/reports/ExportButtons";
import { EmptyState } from "@/components/EmptyState";
import { Lock } from "lucide-react";
import { ENGAGEMENT_PIPELINE_STATUSES } from "@/lib/dashboard/data";

export const dynamic = "force-dynamic";

const UNASSIGNED_ID = "__unassigned__";

type StaffPipelineRow = {
  id: string;
  name: string;
  href: string | null;
  counts: Record<string, number>;
  totalOpen: number;
  completed: number;
};

export default async function TeamPerformanceReportPage() {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const supabase = createClient();
  const { data: canView } = await supabase.rpc("has_permission", { p_workspace_id: workspace.id, p_permission_key: "engagements.view" });
  if (!canView) {
    return (
      <ReportLayout title="Team Performance">
        <EmptyState icon={Lock} message="You don't have permission to view team performance reports." />
      </ReportLayout>
    );
  }

  const [staff, { data: engagements }] = await Promise.all([
    getWorkspaceStaff(supabase, workspace.id),
    supabase.from("engagements").select("assigned_staff_id, status").eq("workspace_id", workspace.id).neq("status", "Archived"),
  ]);

  // Only column-in a status if at least one person actually has an
  // engagement sitting in it -- a firm that never uses "Corrections
  // Requested" shouldn't see a permanently-empty column.
  const countsByStaff = new Map<string, Map<string, number>>();
  const statusesInUse = new Set<string>();
  for (const e of engagements ?? []) {
    const staffKey = e.assigned_staff_id ?? UNASSIGNED_ID;
    if (!countsByStaff.has(staffKey)) countsByStaff.set(staffKey, new Map());
    const forStaff = countsByStaff.get(staffKey)!;
    forStaff.set(e.status, (forStaff.get(e.status) ?? 0) + 1);
    statusesInUse.add(e.status);
  }
  const visibleStatuses = ENGAGEMENT_PIPELINE_STATUSES.filter((s) => statusesInUse.has(s));

  function buildRow(id: string, name: string, href: string | null): StaffPipelineRow {
    const forStaff = countsByStaff.get(id) ?? new Map<string, number>();
    const counts: Record<string, number> = {};
    for (const s of visibleStatuses) counts[s] = forStaff.get(s) ?? 0;
    const completed = forStaff.get("Completed") ?? 0;
    const totalOpen = Array.from(forStaff.values()).reduce((sum, n) => sum + n, 0) - completed;
    return { id, name, href, counts, totalOpen, completed };
  }

  const rows: StaffPipelineRow[] = staff.map((s) => buildRow(s.user_id, s.display_name ?? "Unnamed", `/settings/users/${s.user_id}`));
  if (countsByStaff.has(UNASSIGNED_ID)) {
    rows.push(buildRow(UNASSIGNED_ID, "Unassigned", null));
  }

  const columnDefs: ReportColumnDef<StaffPipelineRow>[] = [
    {
      key: "name",
      label: "Staff member",
      render: (r) =>
        r.href ? (
          <Link href={r.href} className="font-medium text-accent hover:underline">
            {r.name}
          </Link>
        ) : (
          <span className="font-medium text-muted">{r.name}</span>
        ),
      sortValue: (r) => r.name,
    },
    ...visibleStatuses.map(
      (status): ReportColumnDef<StaffPipelineRow> => ({
        key: status,
        label: status,
        align: "right",
        render: (r) => (r.counts[status] > 0 ? r.counts[status] : "--"),
        sortValue: (r) => r.counts[status],
      })
    ),
    { key: "totalOpen", label: "Total open", align: "right", render: (r) => r.totalOpen, sortValue: (r) => r.totalOpen },
    { key: "completed", label: "Completed", align: "right", render: (r) => r.completed, sortValue: (r) => r.completed },
  ];

  const { columns, tableRows } = buildReportTable(rows, columnDefs);

  const csvRows = rows.map((r) => ({
    "Staff member": r.name,
    ...Object.fromEntries(visibleStatuses.map((s) => [s, r.counts[s]])),
    "Total open": r.totalOpen,
    Completed: r.completed,
  }));

  return (
    <ReportLayout
      title="Team Performance"
      description="Where each person's engagements sit in the pipeline right now -- open work by stage, plus completions."
      actions={<ExportButtons rows={csvRows} filename="team-performance-report" />}
    >
      <SortableTable columns={columns} rows={tableRows} emptyMessage="No engagement activity yet." />
    </ReportLayout>
  );
}
