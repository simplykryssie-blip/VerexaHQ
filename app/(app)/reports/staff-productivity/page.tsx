import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { ReportLayout } from "@/components/reports/ReportLayout";
import { FilterBar } from "@/components/reports/FilterBar";
import { SortableTable, type ReportColumn } from "@/components/reports/SortableTable";
import { ExportButtons } from "@/components/reports/ExportButtons";
import { EmptyState } from "@/components/EmptyState";

export const dynamic = "force-dynamic";

type StaffRow = {
  id: string;
  staff_id: string;
  name: string;
  open_engagements: number;
  engagements_completed_this_month: number;
  tasks_completed: number;
  tasks_overdue: number;
  pending_reviews: number;
};

export default async function StaffReportPage({ searchParams }: { searchParams: { q?: string } }) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const supabase = createClient();
  const { data: canView } = await supabase.rpc("has_permission", { p_workspace_id: workspace.id, p_permission_key: "engagements.view" });
  if (!canView) {
    return (
      <ReportLayout title="Staff">
        <EmptyState message="You don't have permission to view staff reports." />
      </ReportLayout>
    );
  }

  const { data: productivity } = await supabase.from("v_staff_productivity").select("*").eq("workspace_id", workspace.id);
  const staffIds = (productivity ?? []).map((r) => r.staff_id).filter((v): v is string => Boolean(v));
  const { data: staff } =
    staffIds.length > 0
      ? await supabase.from("user_profiles").select("id, display_name").in("id", staffIds)
      : { data: [] as { id: string; display_name: string | null }[] };
  const nameById = new Map((staff ?? []).map((s) => [s.id, s.display_name ?? "Unknown"]));

  let rows: StaffRow[] = (productivity ?? []).map((r) => ({
    id: r.staff_id ?? "",
    staff_id: r.staff_id ?? "",
    name: nameById.get(r.staff_id ?? "") ?? "Unknown",
    open_engagements: r.open_engagements ?? 0,
    engagements_completed_this_month: r.engagements_completed_this_month ?? 0,
    tasks_completed: r.tasks_completed ?? 0,
    tasks_overdue: r.tasks_overdue ?? 0,
    pending_reviews: r.pending_reviews ?? 0,
  }));

  if (searchParams.q) {
    const q = searchParams.q.toLowerCase();
    rows = rows.filter((r) => r.name.toLowerCase().includes(q));
  }

  const columns: ReportColumn<StaffRow>[] = [
    { key: "name", label: "Staff member", render: (r) => <span className="font-medium text-ink">{r.name}</span>, sortValue: (r) => r.name },
    { key: "open", label: "Open engagements", align: "right", render: (r) => r.open_engagements, sortValue: (r) => r.open_engagements },
    {
      key: "completed_month",
      label: "Completed this month",
      align: "right",
      render: (r) => r.engagements_completed_this_month,
      sortValue: (r) => r.engagements_completed_this_month,
    },
    { key: "tasks_done", label: "Tasks completed", align: "right", render: (r) => r.tasks_completed, sortValue: (r) => r.tasks_completed },
    { key: "tasks_overdue", label: "Tasks overdue", align: "right", render: (r) => r.tasks_overdue, sortValue: (r) => r.tasks_overdue },
    { key: "reviews", label: "Pending reviews", align: "right", render: (r) => r.pending_reviews, sortValue: (r) => r.pending_reviews },
  ];

  const csvRows = rows.map((r) => ({
    "Staff member": r.name,
    "Open engagements": r.open_engagements,
    "Completed this month": r.engagements_completed_this_month,
    "Tasks completed": r.tasks_completed,
    "Tasks overdue": r.tasks_overdue,
    "Pending reviews": r.pending_reviews,
  }));

  return (
    <ReportLayout
      title="Staff"
      description="Assigned workload, task completion, and review queue by staff member."
      filters={<FilterBar reportKey="staff-productivity" showDateRange={false} searchPlaceholder="Search staff member..." />}
      actions={<ExportButtons rows={csvRows} filename="staff-productivity-report" />}
    >
      <SortableTable columns={columns} rows={rows} emptyMessage="No staff activity yet." />
    </ReportLayout>
  );
}
