import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { ReportLayout } from "@/components/reports/ReportLayout";
import { FilterBar } from "@/components/reports/FilterBar";
import { SortableTable, type ReportColumn } from "@/components/reports/SortableTable";
import { ExportButtons } from "@/components/reports/ExportButtons";
import { SimpleBarChart } from "@/components/reports/SimpleBarChart";
import { EmptyState } from "@/components/EmptyState";

export const dynamic = "force-dynamic";

type MonthRow = { id: string; month: string; newClients: number; newEngagements: number };

export default async function GrowthReportPage({ searchParams }: { searchParams: { from?: string; to?: string } }) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const supabase = createClient();
  const { data: canView } = await supabase.rpc("has_permission", { p_workspace_id: workspace.id, p_permission_key: "clients.view" });
  if (!canView) {
    return (
      <ReportLayout title="Growth">
        <EmptyState message="You don't have permission to view growth reports." />
      </ReportLayout>
    );
  }

  const [{ data: clients }, { data: engagements }] = await Promise.all([
    supabase.from("clients").select("created_at").eq("workspace_id", workspace.id).is("merged_into_client_id", null),
    supabase.from("engagements").select("open_date").eq("workspace_id", workspace.id),
  ]);

  let clientDates = (clients ?? []).map((c) => c.created_at);
  let engagementDates = (engagements ?? []).map((e) => e.open_date).filter((d): d is string => Boolean(d));
  if (searchParams.from) {
    clientDates = clientDates.filter((d) => d >= searchParams.from!);
    engagementDates = engagementDates.filter((d) => d >= searchParams.from!);
  }
  if (searchParams.to) {
    clientDates = clientDates.filter((d) => d <= searchParams.to!);
    engagementDates = engagementDates.filter((d) => d <= searchParams.to!);
  }

  function monthKey(d: string) {
    const date = new Date(d);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  }
  function monthLabel(key: string) {
    const [y, m] = key.split("-");
    return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString(undefined, { month: "short", year: "2-digit" });
  }

  const clientsByMonth = new Map<string, number>();
  for (const d of clientDates) clientsByMonth.set(monthKey(d), (clientsByMonth.get(monthKey(d)) ?? 0) + 1);
  const engagementsByMonth = new Map<string, number>();
  for (const d of engagementDates) engagementsByMonth.set(monthKey(d), (engagementsByMonth.get(monthKey(d)) ?? 0) + 1);

  const allMonths = Array.from(new Set([...clientsByMonth.keys(), ...engagementsByMonth.keys()])).sort();
  const rows: MonthRow[] = allMonths.map((key) => ({
    id: key,
    month: monthLabel(key),
    newClients: clientsByMonth.get(key) ?? 0,
    newEngagements: engagementsByMonth.get(key) ?? 0,
  }));

  const chartData = rows.slice(-6).map((r) => ({ label: r.month, value: r.newClients }));

  const columns: ReportColumn<MonthRow>[] = [
    { key: "month", label: "Month", render: (r) => r.month, sortValue: (r) => r.id },
    { key: "clients", label: "New clients", align: "right", render: (r) => r.newClients, sortValue: (r) => r.newClients },
    { key: "engagements", label: "New engagements", align: "right", render: (r) => r.newEngagements, sortValue: (r) => r.newEngagements },
  ];

  const csvRows = rows.map((r) => ({ Month: r.month, "New clients": r.newClients, "New engagements": r.newEngagements }));

  return (
    <ReportLayout
      title="Growth"
      description="New clients and engagements opened, by month."
      filters={<FilterBar reportKey="growth" showDateRange />}
      actions={<ExportButtons rows={csvRows} filename="growth-report" />}
    >
      {chartData.length > 0 && (
        <div className="rounded-xl border border-border bg-surface p-5">
          <h2 className="text-sm font-semibold text-ink">New clients, last 6 months</h2>
          <div className="mt-3">
            <SimpleBarChart data={chartData} />
          </div>
        </div>
      )}
      <SortableTable columns={columns} rows={rows.slice().reverse()} emptyMessage="No growth data yet." />
    </ReportLayout>
  );
}
