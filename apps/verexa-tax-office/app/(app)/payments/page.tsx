import Link from "next/link";
import { CreditCard } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { getPayments } from "@/features/billing/queries";
import { PAYMENT_STATUS_LABELS, paymentMethodLabel, paymentStatusLabel } from "@/lib/validation/billing";
import { formatCurrency, formatDate } from "@/lib/formatters";

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
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

  const payments = await getPayments(workspaceId, { status });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Payments</h1>
        <p className="text-sm text-muted-foreground mt-1">All payments recorded across your workspace. Card/ACH processing shows as Not Connected until a provider is added.</p>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Button asChild variant={!status ? "secondary" : "ghost"} size="sm">
          <Link href="/payments">All</Link>
        </Button>
        {Object.entries(PAYMENT_STATUS_LABELS).map(([v, l]) => (
          <Button asChild key={v} variant={status === v ? "secondary" : "ghost"} size="sm">
            <Link href={`/payments?status=${v}`}>{l}</Link>
          </Button>
        ))}
      </div>

      {payments.length === 0 ? (
        <EmptyState icon={CreditCard} title="No payments yet" description="Record a payment from an invoice to see it here." />
      ) : (
        <div className="rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead>Invoice</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments.map((p) => {
                const client = p.client as { first_name?: string; last_name?: string; company?: string } | null;
                const invoice = p.invoice as { id: string; invoice_number?: string } | null;
                return (
                  <TableRow key={p.id}>
                    <TableCell>{client?.company || `${client?.first_name ?? ""} ${client?.last_name ?? ""}`.trim() || "—"}</TableCell>
                    <TableCell>
                      {invoice ? (
                        <Link href={`/invoices/${invoice.id}`} className="hover:underline">
                          {invoice.invoice_number}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>{formatCurrency(p.amount)}</TableCell>
                    <TableCell>{paymentMethodLabel(p.method)}</TableCell>
                    <TableCell>
                      <Badge variant={p.status === "succeeded" ? "success" : p.status === "failed" ? "destructive" : "secondary"}>{paymentStatusLabel(p.status)}</Badge>
                    </TableCell>
                    <TableCell>{formatDate(p.paid_at ?? p.created_at)}</TableCell>
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
