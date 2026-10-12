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
import { Badge } from "@/components/ui/Badge";

export const dynamic = "force-dynamic";

type ClientRow = {
  id: string;
  clientLabel: string;
  client_type: string;
  tags: string[];
  created_at: string;
};

function clientLabel(c: { client_type: string; first_name: string | null; last_name: string | null; business_name: string | null }) {
  if (c.client_type !== "individual" && c.business_name) return c.business_name;
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
    .select("id, client_type, first_name, last_name, business_name, tags, created_at")
    .eq("workspace_id", workspace.id)
    .is("merged_into_client_id", null)
    .order("created_at", { ascending: false });

  let rows: ClientRow[] = (clients ?? []).map((c) => ({
    id: c.id,
    clientLabel: clientLabel(c),
    client_type: c.client_type,
    tags: c.tags ?? [],
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

  const byTag = new Map<string, number>();
  for (const r of rows) {
    for (const tag of r.tags) byTag.set(tag, (byTag.get(tag) ?? 0) + 1);
  }

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
    {
      key: "tags",
      label: "Tags",
      render: (r) => <span className="text-xs text-muted">{r.tags.length ? r.tags.join(", ") : "--"}</span>,
      sortValue: (r) => r.tags.join(", "),
    },
    { key: "created", label: "Added", render: (r) => new Date(r.created_at).toLocaleDateString(), sortValue: (r) => r.created_at },
  ];

  const { columns, tableRows } = buildReportTable(rows, columnDefs);

  const csvRows = rows.map((r) => ({ Client: r.clientLabel, Type: r.client_type, Tags: r.tags.join(", "), Added: r.created_at }));

  return (
    <ReportLayout
      title="Clients"
      description="Contact growth and tag breakdown."
      filters={<FilterBar reportKey="clients" searchPlaceholder="Search client..." />}
      actions={<ExportButtons rows={csvRows} filename="clients-report" />}
    >
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {chartData.length > 0 && (
          <div className="rounded-2xl border border-border bg-surface shadow-soft p-5">
            <h2 className="text-sm font-semibold text-ink">New clients, last 6 months</h2>
            <div className="mt-3">
              <SimpleBarChart data={chartData} />
            </div>
          </div>
        )}
        <div className="rounded-2xl border border-border bg-surface shadow-soft p-5">
          <h2 className="text-sm font-semibold text-ink">By tag</h2>
          <ul className="mt-3 space-y-1.5 text-sm">
            {Array.from(byTag.entries()).map(([status, count]) => (
              <li key={status} className="flex items-center justify-between">
                
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
