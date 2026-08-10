import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { ReportLayout } from "@/components/reports/ReportLayout";
import { FilterBar } from "@/components/reports/FilterBar";
import { SortableTable } from "@/components/reports/SortableTable";
import { buildReportTable, type ReportColumnDef } from "@/lib/reports/buildReportTable";
import { ExportButtons } from "@/components/reports/ExportButtons";
import { SimpleBarChart } from "@/components/reports/SimpleBarChart";
import { EmptyState } from "@/components/EmptyState";
import { Lock } from "lucide-react";

export const dynamic = "force-dynamic";

type ClientRow = {
  id: string;
  clientLabel: string;
  client_type: string;
  lifecycle_status: string;
  created_at: string;
};

function clientLabel(c: { client_type: string; first_name: string | null; last_name: string | null; business_name: string | null }) {
  if (c.client_type === "business" && c.business_name) return c.business_name;
  return [c.first_name, c.last_name].filter(Boolean).join(" ") || "Unnamed client";
}

export default async function ClientsReportPage({ searchParams }: { searchParams: { q?: string; from?: string; to?: string } }) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const supabase = createClient();
  const { data: canView } = await supabase.rpc("has_permission", { p_workspace_id: workspace.id, p_permission_key: "clients.view" });
  if (!canView) {
    return (
      <ReportLayout title="Clients">
        <EmptyState icon={Lock} message="You don't have permission to view client reports." />
      </ReportLayout>
    );
  }

  const { data: clients } = await supabase
    .from("clients")
    .select("id, client_type, first_name, last_name, business_name, lifecycle_status, created_at")
    .eq("workspace_id", workspace.id)
    .is("merged_into_client_id", null)
    .order("created_at", { ascending: false });

  let rows: ClientRow[] = (clients ?? []).map((c) => ({
    id: c.id,
    clientLabel: clientLabel(c),
    client_type: c.client_type,
    lifecycle_status: c.lifecycle_status,
    created_at: c.created_at,
  }));

  if (searchParams.from) rows = rows.filter((r) => r.created_at >= searchParams.from!);
  if (searchParams.to) rows = rows.filter((r) => r.created_at <= searchParams.to!);
  if (searchParams.q) {
    const q = searchParams.q.toLowerCase();
    rows = rows.filter((r) => r.clientLabel.toLowerCase().includes(q));
  }

  const byMonth = new Map<string, number>();
  for (const c of clients ?? []) {
    const month = new Date(c.created_at).toLocaleDateString(undefined, { month: "short", year: "2-digit" });
    byMonth.set(month, (byMonth.get(month) ?? 0) + 1);
  }
  const chartData = Array.from(byMonth.entries())
    .slice(-6)
    .map(([label, value]) => ({ label, value }));

  const byStatus = new Map<string, number>();
  for (const r of rows) byStatus.set(r.lifecycle_status, (byStatus.get(r.lifecycle_status) ?? 0) + 1);

  const columnDefs: ReportColumnDef<ClientRow>[] = [
    {
      key: "client",
      label: "Client",
      render: (r) => (
        <Link href={`/clients/${r.id}`} className="font-medium text-accent hover:underline">
          {r.clientLabel}
        </Link>
      ),
      sortValue: (r) => r.clientLabel,
    },
    { key: "type", label: "Type", render: (r) => <span className="capitalize">{r.client_type}</span>, sortValue: (r) => r.client_type },
    { key: "status", label: "Lifecycle status", render: (r) => <span className="capitalize">{r.lifecycle_status}</span>, sortValue: (r) => r.lifecycle_status },
    { key: "created", label: "Added", render: (r) => new Date(r.created_at).toLocaleDateString(), sortValue: (r) => r.created_at },
  ];

  const { columns, tableRows } = buildReportTable(rows, columnDefs);

  const csvRows = rows.map((r) => ({ Client: r.clientLabel, Type: r.client_type, "Lifecycle status": r.lifecycle_status, Added: r.created_at }));

  return (
    <ReportLayout
      title="Clients"
      description="Client growth and lifecycle status breakdown."
      filters={<FilterBar reportKey="clients" searchPlaceholder="Search client..." />}
      actions={<ExportButtons rows={csvRows} filename="clients-report" />}
    >
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {chartData.length > 0 && (
          <div className="rounded-xl border border-border bg-surface p-5">
            <h2 className="text-sm font-semibold text-ink">New clients, last 6 months</h2>
            <div className="mt-3">
              <SimpleBarChart data={chartData} />
            </div>
          </div>
        )}
        <div className="rounded-xl border border-border bg-surface p-5">
          <h2 className="text-sm font-semibold text-ink">By lifecycle status</h2>
          <ul className="mt-3 space-y-1.5 text-sm">
            {Array.from(byStatus.entries()).map(([status, count]) => (
              <li key={status} className="flex items-center justify-between">
                <span className="capitalize text-slate">{status}</span>
                <span className="font-medium text-ink">{count}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <SortableTable columns={columns} rows={tableRows} emptyMessage="No clients match this filter." />
    </ReportLayout>
  );
}
