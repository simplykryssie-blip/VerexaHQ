import Link from "next/link";
import { Receipt, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { getInvoices, getOutstandingBalance } from "@/features/billing/queries";
import { INVOICE_STATUS_LABELS, invoiceStatusLabel } from "@/lib/validation/billing";
import { formatCurrency, formatDate } from "@/lib/formatters";

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: membership } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user!.id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  const workspaceId = membership!.workspace_id;

  const [invoices, outstanding] = await Promise.all([getInvoices(workspaceId, { status }), getOutstandingBalance(workspaceId)]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Invoices</h1>
          <p className="text-sm text-muted-foreground mt-1">Outstanding balance across your workspace: {formatCurrency(outstanding)}</p>
        </div>
        <Button asChild variant="brand" size="sm">
          <Link href="/invoices/new">
            <Plus className="h-4 w-4" /> New invoice
          </Link>
        </Button>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Button asChild variant={!status ? "secondary" : "ghost"} size="sm">
          <Link href="/invoices">All</Link>
        </Button>
        {Object.entries(INVOICE_STATUS_LABELS).map(([v, l]) => (
          <Button asChild key={v} variant={status === v ? "secondary" : "ghost"} size="sm">
            <Link href={`/invoices?status=${v}`}>{l}</Link>
          </Button>
        ))}
      </div>

      {invoices.length === 0 ? (
        <EmptyState icon={Receipt} title="No invoices yet" description="Create your first invoice to start billing clients." />
      ) : (
        <div className="rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Balance due</TableHead>
                <TableHead>Due date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map((inv) => {
                const client = inv.client as { first_name?: string; last_name?: string; company?: string } | null;
                return (
                  <TableRow key={inv.id}>
                    <TableCell>
                      <Link href={`/invoices/${inv.id}`} className="font-medium hover:underline">
                        {inv.invoice_number}
                      </Link>
                    </TableCell>
                    <TableCell>{client?.company || `${client?.first_name ?? ""} ${client?.last_name ?? ""}`.trim() || "—"}</TableCell>
                    <TableCell>
                      <Badge variant={inv.status === "paid" ? "success" : inv.status === "past_due" ? "destructive" : "secondary"}>{invoiceStatusLabel(inv.status)}</Badge>
                    </TableCell>
                    <TableCell>{formatCurrency(inv.total)}</TableCell>
                    <TableCell>{formatCurrency(inv.balance_due)}</TableCell>
                    <TableCell>{formatDate(inv.due_date)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
