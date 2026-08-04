import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { ReportLayout } from "@/components/reports/ReportLayout";
import { FilterBar } from "@/components/reports/FilterBar";
import { SortableTable, type ReportColumn } from "@/components/reports/SortableTable";
import { ExportButtons } from "@/components/reports/ExportButtons";
import { SimpleBarChart } from "@/components/reports/SimpleBarChart";
import { EmptyState } from "@/components/EmptyState";

export const dynamic = "force-dynamic";

type InvoiceRow = {
  id: string;
  invoice_number: string | null;
  status: string;
  total_amount: number;
  amount_paid: number;
  due_date: string | null;
  issue_date: string;
  client_id: string;
  clientLabel: string;
};

function money(n: number) {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function clientLabel(c: { client_type: string; first_name: string | null; last_name: string | null; business_name: string | null } | null) {
  if (!c) return "--";
  if (c.client_type === "business" && c.business_name) return c.business_name;
  return [c.first_name, c.last_name].filter(Boolean).join(" ") || "Unnamed client";
}

export default async function FinancialReportPage({
  searchParams,
}: {
  searchParams: { q?: string; from?: string; to?: string; filter?: string };
}) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const supabase = createClient();
  const { data: canView } = await supabase.rpc("has_permission", { p_workspace_id: workspace.id, p_permission_key: "billing.view" });
  if (!canView) {
    return (
      <ReportLayout title="Revenue">
        <EmptyState message="You don't have permission to view financial reports." />
      </ReportLayout>
    );
  }

  const [{ data: invoices }, { data: payments }] = await Promise.all([
    supabase
      .from("invoices")
      .select("id, invoice_number, status, total_amount, amount_paid, due_date, issue_date, client_id, clients(first_name, last_name, business_name, client_type)")
      .eq("workspace_id", workspace.id)
      .order("issue_date", { ascending: false }),
    supabase
      .from("payments")
      .select("amount, payment_date")
      .eq("workspace_id", workspace.id)
      .eq("status", "succeeded")
      .order("payment_date"),
  ]);

  let rows: InvoiceRow[] = (invoices ?? []).map((i) => ({
    id: i.id,
    invoice_number: i.invoice_number,
    status: i.status,
    total_amount: i.total_amount,
    amount_paid: i.amount_paid,
    due_date: i.due_date,
    issue_date: i.issue_date,
    client_id: i.client_id,
    clientLabel: clientLabel(i.clients as never),
  }));

  if (searchParams.filter === "outstanding") {
    rows = rows.filter((r) => r.status !== "paid" && r.status !== "void" && r.status !== "draft");
  }
  if (searchParams.from) rows = rows.filter((r) => r.issue_date >= searchParams.from!);
  if (searchParams.to) rows = rows.filter((r) => r.issue_date <= searchParams.to!);
  if (searchParams.q) {
    const q = searchParams.q.toLowerCase();
    rows = rows.filter((r) => r.invoice_number?.toLowerCase().includes(q) || r.clientLabel.toLowerCase().includes(q));
  }

  const revenueByMonth = new Map<string, number>();
  for (const p of payments ?? []) {
    const month = new Date(p.payment_date).toLocaleDateString(undefined, { month: "short" });
    revenueByMonth.set(month, (revenueByMonth.get(month) ?? 0) + p.amount);
  }
  const chartData = Array.from(revenueByMonth.entries())
    .slice(-6)
    .map(([label, value]) => ({ label, value }));

  const columns: ReportColumn<InvoiceRow>[] = [
    {
      key: "invoice_number",
      label: "Invoice",
      render: (r) => (
        <Link href={`/clients/${r.client_id}`} className="font-medium text-accent hover:underline">
          {r.invoice_number ?? "Invoice"}
        </Link>
      ),
      sortValue: (r) => r.invoice_number ?? "",
    },
    { key: "client", label: "Client", render: (r) => r.clientLabel, sortValue: (r) => r.clientLabel },
    { key: "status", label: "Status", render: (r) => <span className="capitalize">{r.status}</span>, sortValue: (r) => r.status },
    { key: "total", label: "Total", align: "right", render: (r) => money(r.total_amount), sortValue: (r) => r.total_amount },
    { key: "paid", label: "Paid", align: "right", render: (r) => money(r.amount_paid), sortValue: (r) => r.amount_paid },
    {
      key: "balance",
      label: "Balance",
      align: "right",
      render: (r) => money(r.total_amount - r.amount_paid),
      sortValue: (r) => r.total_amount - r.amount_paid,
    },
    {
      key: "due",
      label: "Due date",
      render: (r) => (r.due_date ? new Date(r.due_date).toLocaleDateString() : "--"),
      sortValue: (r) => r.due_date ?? "",
    },
  ];

  const csvRows = rows.map((r) => ({
    Invoice: r.invoice_number ?? "",
    Client: r.clientLabel,
    Status: r.status,
    Total: r.total_amount,
    Paid: r.amount_paid,
    Balance: r.total_amount - r.amount_paid,
    "Due date": r.due_date ?? "",
  }));

  return (
    <ReportLayout
      title="Revenue"
      description="Revenue collected by month, plus outstanding balances and collections."
      filters={<FilterBar reportKey="financial" searchPlaceholder="Search invoice or client..." />}
      actions={<ExportButtons rows={csvRows} filename="revenue-report" />}
    >
      {chartData.length > 0 && (
        <div className="rounded-xl border border-border bg-surface p-5">
          <h2 className="text-sm font-semibold text-ink">Revenue collected, last 6 months</h2>
          <div className="mt-3">
            <SimpleBarChart data={chartData} formatValue={money} />
          </div>
        </div>
      )}
      <SortableTable columns={columns} rows={rows} emptyMessage="No invoices match this filter." />
    </ReportLayout>
  );
}
