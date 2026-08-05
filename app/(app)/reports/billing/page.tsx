import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { ReportLayout } from "@/components/reports/ReportLayout";
import { FilterBar } from "@/components/reports/FilterBar";
import { SortableTable, type ReportColumn } from "@/components/reports/SortableTable";
import { ExportButtons } from "@/components/reports/ExportButtons";
import { EmptyState } from "@/components/EmptyState";
import { clientLabel } from "@/lib/documentEntityLabels";

export const dynamic = "force-dynamic";

type QuoteRow = {
  id: string;
  quote_number: string | null;
  title: string;
  status: string;
  total_amount: number;
  client_id: string;
  clientLabel: string;
  created_at: string;
};

function money(n: number) {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default async function BillingReportPage({ searchParams }: { searchParams: { q?: string; from?: string; to?: string } }) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const supabase = createClient();
  const { data: canView } = await supabase.rpc("has_permission", { p_workspace_id: workspace.id, p_permission_key: "billing.view" });
  if (!canView) {
    return (
      <ReportLayout title="Billing">
        <EmptyState message="You don't have permission to view billing reports." />
      </ReportLayout>
    );
  }

  const { data: quotes } = await supabase
    .from("quotes")
    .select("id, quote_number, title, status, total_amount, client_id, created_at, clients(first_name, last_name, business_name, client_type)")
    .eq("workspace_id", workspace.id)
    .order("created_at", { ascending: false });

  let rows: QuoteRow[] = (quotes ?? []).map((q) => ({
    id: q.id,
    quote_number: q.quote_number,
    title: q.title,
    status: q.status,
    total_amount: q.total_amount,
    client_id: q.client_id,
    clientLabel: clientLabel(q.clients as never),
    created_at: q.created_at,
  }));

  if (searchParams.from) rows = rows.filter((r) => r.created_at >= searchParams.from!);
  if (searchParams.to) rows = rows.filter((r) => r.created_at <= searchParams.to!);
  if (searchParams.q) {
    const q = searchParams.q.toLowerCase();
    rows = rows.filter((r) => r.clientLabel.toLowerCase().includes(q) || r.title.toLowerCase().includes(q));
  }

  const byStatus = new Map<string, { count: number; total: number }>();
  for (const r of rows) {
    const entry = byStatus.get(r.status) ?? { count: 0, total: 0 };
    entry.count += 1;
    entry.total += r.total_amount;
    byStatus.set(r.status, entry);
  }

  const columns: ReportColumn<QuoteRow>[] = [
    {
      key: "client",
      label: "Client",
      render: (r) => (
        <Link href={`/clients/${r.client_id}`} className="font-medium text-accent hover:underline">
          {r.clientLabel}
        </Link>
      ),
      sortValue: (r) => r.clientLabel,
    },
    { key: "quote", label: "Quote", render: (r) => `${r.quote_number ?? "Quote"} -- ${r.title}`, sortValue: (r) => r.quote_number ?? "" },
    { key: "status", label: "Status", render: (r) => <span className="capitalize">{r.status}</span>, sortValue: (r) => r.status },
    { key: "amount", label: "Amount", align: "right", render: (r) => money(r.total_amount), sortValue: (r) => r.total_amount },
    { key: "created", label: "Created", render: (r) => new Date(r.created_at).toLocaleDateString(), sortValue: (r) => r.created_at },
  ];

  const csvRows = rows.map((r) => ({ Client: r.clientLabel, Quote: r.quote_number ?? "", Status: r.status, Amount: r.total_amount, Created: r.created_at }));

  return (
    <ReportLayout
      title="Billing"
      description="Quote funnel -- draft through accepted -- across the workspace."
      filters={<FilterBar reportKey="billing" searchPlaceholder="Search client or quote..." />}
      actions={<ExportButtons rows={csvRows} filename="billing-report" />}
    >
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {Array.from(byStatus.entries()).map(([status, { count, total }]) => (
          <div key={status} className="rounded-xl border border-border bg-surface p-4">
            <p className="text-xs uppercase tracking-wide text-muted capitalize">{status}</p>
            <p className="mt-1 text-xl font-semibold text-ink">{count}</p>
            <p className="text-xs text-muted">{money(total)}</p>
          </div>
        ))}
      </div>
      <SortableTable columns={columns} rows={rows} emptyMessage="No quotes match this filter." />
    </ReportLayout>
  );
}
