import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getPortalContext } from "@/lib/auth/portal";
import { getInvoiceDetail } from "@/features/billing/queries";
import { PrintReceiptButton } from "@/features/portal/print-receipt-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { invoiceStatusLabel, paymentMethodLabel, paymentStatusLabel } from "@/lib/validation/billing";
import { formatCurrency, formatDate } from "@/lib/formatters";

export default async function PortalInvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getPortalContext();
  if (!context) redirect("/portal/sign-in");

  const { invoice, items, payments } = await getInvoiceDetail(id);
  if (!invoice || invoice.client_id !== context.client.id) notFound();

  const displayName = context.contactName ?? `${context.client.first_name} ${context.client.last_name}`.trim();

  return (
    <div className="space-y-4">
      <Link href="/portal/invoices" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to invoices
      </Link>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 flex-wrap gap-2">
          <div>
            <CardTitle className="text-base">Invoice {invoice.invoice_number}</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Issued {formatDate(invoice.issue_date)} · Due {formatDate(invoice.due_date)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={invoice.status === "paid" ? "success" : invoice.status === "past_due" ? "destructive" : "secondary"}>{invoiceStatusLabel(invoice.status)}</Badge>
            <PrintReceiptButton
              invoice={{ invoice_number: invoice.invoice_number, total: invoice.total, amount_paid: invoice.amount_paid, balance_due: invoice.balance_due }}
              items={items.map((i) => ({ description: i.description, quantity: i.quantity, unit_price: i.unit_price, line_total: i.line_total }))}
              payments={payments.map((p) => ({ status: p.status, paid_at: p.paid_at, created_at: p.created_at, method: p.method, amount: p.amount }))}
              clientName={displayName}
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {invoice.client_message && <p className="text-sm">{invoice.client_message}</p>}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Description</TableHead>
                <TableHead>Qty</TableHead>
                <TableHead>Unit price</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>{item.description}</TableCell>
                  <TableCell>{item.quantity}</TableCell>
                  <TableCell>{formatCurrency(item.unit_price)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(item.line_total)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="flex flex-col items-end gap-0.5 text-sm pt-2 border-t border-border">
            <span>Subtotal: {formatCurrency(invoice.subtotal)}</span>
            {Number(invoice.discount_total) > 0 && <span>Discount: -{formatCurrency(invoice.discount_total)}</span>}
            {Number(invoice.tax_total) > 0 && <span>Tax: {formatCurrency(invoice.tax_total)}</span>}
            <span className="font-semibold">Total: {formatCurrency(invoice.total)}</span>
            <span>Paid: {formatCurrency(invoice.amount_paid)}</span>
            <span className="font-semibold">Balance due: {formatCurrency(invoice.balance_due)}</span>
          </div>
        </CardContent>
      </Card>

      {payments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Payment history</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>{formatDate(p.paid_at ?? p.created_at)}</TableCell>
                    <TableCell>{paymentMethodLabel(p.method)}</TableCell>
                    <TableCell>
                      <Badge variant={p.status === "succeeded" ? "success" : p.status === "failed" ? "destructive" : "secondary"}>{paymentStatusLabel(p.status)}</Badge>
                    </TableCell>
                    <TableCell className="text-right">{formatCurrency(p.amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
