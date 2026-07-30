"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Send, Ban, Plus, Printer, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";
import { friendlyDbError } from "@/lib/errors";
import { toast } from "@/components/ui/toaster";
import { invoiceStatusLabel, paymentMethodLabel, paymentStatusLabel, PAYMENT_METHOD_LABELS } from "@/lib/validation/billing";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/formatters";
import type { Tables } from "@/types/database";

type InvoiceRow = Tables<"invoices"> & {
  client?: { first_name?: string | null; last_name?: string | null; company?: string | null } | null;
  engagement?: { engagement_number?: string | null; title?: string | null } | null;
};

export function InvoicePanel({ invoice, items, payments }: { invoice: InvoiceRow; items: Tables<"invoice_items">[]; payments: Tables<"payments">[] }) {
  const router = useRouter();
  const supabase = createClient();
  const [busy, setBusy] = useState(false);
  const client = invoice.client;
  const clientName = client?.company || `${client?.first_name ?? ""} ${client?.last_name ?? ""}`.trim();

  async function send() {
    setBusy(true);
    const { error } = await supabase.from("invoices").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", invoice.id);
    setBusy(false);
    if (error) {
      toast.error(friendlyDbError(error.message));
      return;
    }
    toast.success("Invoice sent");
    router.refresh();
  }

  async function voidInvoice() {
    if (!confirm("Void this invoice? This cannot be undone.")) return;
    setBusy(true);
    const { error } = await supabase.from("invoices").update({ status: "void", voided_at: new Date().toISOString() }).eq("id", invoice.id);
    setBusy(false);
    if (error) {
      toast.error(friendlyDbError(error.message));
      return;
    }
    toast.success("Invoice voided");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 flex-wrap gap-2">
          <div>
            <CardTitle className="text-base">Invoice {invoice.invoice_number}</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">{clientName}</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={invoice.status === "paid" ? "success" : invoice.status === "past_due" || invoice.status === "void" ? "destructive" : "secondary"}>
              {invoiceStatusLabel(invoice.status)}
            </Badge>
            {invoice.status === "draft" && (
              <Button size="sm" variant="brand" disabled={busy} onClick={send}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                <Send className="h-4 w-4" /> Send
              </Button>
            )}
            {invoice.status !== "void" && invoice.status !== "paid" && (
              <Button size="sm" variant="ghost" disabled={busy} onClick={voidInvoice}>
                <Ban className="h-4 w-4" /> Void
              </Button>
            )}
            <PrintReceiptButton invoice={invoice} items={items} payments={payments} clientName={clientName} />
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <Stat label="Subtotal" value={formatCurrency(invoice.subtotal)} />
            <Stat label="Total" value={formatCurrency(invoice.total)} />
            <Stat label="Paid" value={formatCurrency(invoice.amount_paid)} />
            <Stat label="Balance due" value={formatCurrency(invoice.balance_due)} />
          </div>
          {invoice.client_message && <p className="text-sm mt-3">&ldquo;{invoice.client_message}&rdquo;</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Line items</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Description</TableHead>
                <TableHead>Qty</TableHead>
                <TableHead>Unit price</TableHead>
                <TableHead>Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((i) => (
                <TableRow key={i.id}>
                  <TableCell>{i.description}</TableCell>
                  <TableCell>{i.quantity}</TableCell>
                  <TableCell>{formatCurrency(i.unit_price)}</TableCell>
                  <TableCell>{formatCurrency(i.line_total)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Payments</CardTitle>
          <RecordPaymentDialog workspaceId={invoice.workspace_id} clientId={invoice.client_id} invoiceId={invoice.id} balanceDue={Number(invoice.balance_due ?? 0)} />
        </CardHeader>
        <CardContent className="space-y-2">
          {payments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No payments recorded yet.</p>
          ) : (
            payments.map((p) => <PaymentRow key={p.id} payment={p} />)
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-lg font-semibold">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function RecordPaymentDialog({ workspaceId, clientId, invoiceId, balanceDue }: { workspaceId: string; clientId: string; invoiceId: string; balanceDue: number }) {
  const router = useRouter();
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(balanceDue > 0 ? String(balanceDue) : "");
  const [method, setMethod] = useState<keyof typeof PAYMENT_METHOD_LABELS>("card");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!amount || Number(amount) <= 0) return;
    setBusy(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error } = await supabase.from("payments").insert({
      workspace_id: workspaceId,
      client_id: clientId,
      invoice_id: invoiceId,
      amount: Number(amount),
      method,
      status: "succeeded",
      reference_number: reference || null,
      notes: notes || null,
      paid_at: new Date().toISOString(),
      recorded_by: user?.id ?? null,
    });
    setBusy(false);
    if (error) {
      toast.error(friendlyDbError(error.message));
      return;
    }
    toast.success("Payment recorded");
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus className="h-4 w-4" /> Record payment
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record a manual payment</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Amount *</Label>
            <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Method</Label>
            <Select value={method} onValueChange={(v) => setMethod(v as typeof method)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(PAYMENT_METHOD_LABELS).map(([v, l]) => (
                  <SelectItem key={v} value={v}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Reference number</Label>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Check #, confirmation #…" />
          </div>
          <div className="space-y-1">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="brand" disabled={busy || !amount} onClick={submit}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Record payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PaymentRow({ payment }: { payment: Tables<"payments"> }) {
  const remaining = Number(payment.amount) - Number(payment.refunded_amount);
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-border p-2 text-sm flex-wrap">
      <div>
        <span className="font-medium">{formatCurrency(payment.amount)}</span> via {paymentMethodLabel(payment.method)}
        <div className="text-xs text-muted-foreground">{formatDateTime(payment.paid_at ?? payment.created_at)}</div>
      </div>
      <div className="flex items-center gap-2">
        <Badge variant={payment.status === "succeeded" ? "success" : payment.status === "failed" ? "destructive" : "secondary"}>{paymentStatusLabel(payment.status)}</Badge>
        {payment.status === "succeeded" && remaining > 0 && <RefundDialog payment={payment} />}
      </div>
    </div>
  );
}

function RefundDialog({ payment }: { payment: Tables<"payments"> }) {
  const router = useRouter();
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const remaining = Number(payment.amount) - Number(payment.refunded_amount);
  const [amount, setAmount] = useState(String(remaining));
  const [busy, setBusy] = useState(false);

  async function submit() {
    const refundAmount = Number(amount);
    if (refundAmount <= 0 || refundAmount > remaining) return;
    setBusy(true);
    const nextRefunded = Number(payment.refunded_amount) + refundAmount;
    const status = nextRefunded >= Number(payment.amount) ? "refunded" : "partially_refunded";
    const { error } = await supabase.from("payments").update({ refunded_amount: nextRefunded, status }).eq("id", payment.id);
    setBusy(false);
    if (error) {
      toast.error(friendlyDbError(error.message));
      return;
    }
    toast.success("Refund recorded");
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost">
          <Undo2 className="h-4 w-4" /> Refund
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Refund payment</DialogTitle>
        </DialogHeader>
        <div className="space-y-1">
          <Label>Refund amount (up to {formatCurrency(remaining)})</Label>
          <Input type="number" step="0.01" max={remaining} value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="destructive" disabled={busy || Number(amount) <= 0 || Number(amount) > remaining} onClick={submit}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Issue refund
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PrintReceiptButton({
  invoice,
  items,
  payments,
  clientName,
}: {
  invoice: InvoiceRow;
  items: Tables<"invoice_items">[];
  payments: Tables<"payments">[];
  clientName: string;
}) {
  function print() {
    const w = window.open("", "_blank", "width=640,height=800");
    if (!w) return;
    const rows = items.map((i) => `<tr><td>${i.description}</td><td>${i.quantity}</td><td>${formatCurrency(i.unit_price)}</td><td>${formatCurrency(i.line_total)}</td></tr>`).join("");
    const paymentRows = payments
      .filter((p) => p.status === "succeeded" || p.status === "partially_refunded")
      .map((p) => `<tr><td>${formatDate(p.paid_at ?? p.created_at)}</td><td>${paymentMethodLabel(p.method)}</td><td>${formatCurrency(p.amount)}</td></tr>`)
      .join("");
    w.document.write(`
      <html><head><title>Receipt ${invoice.invoice_number}</title>
      <style>body{font-family:system-ui,sans-serif;padding:32px;color:#111} table{width:100%;border-collapse:collapse;margin:16px 0} td,th{padding:6px;border-bottom:1px solid #ddd;text-align:left} h1{font-size:20px}</style>
      </head><body>
      <h1>Invoice ${invoice.invoice_number}</h1>
      <p>${clientName}</p>
      <table><thead><tr><th>Description</th><th>Qty</th><th>Unit price</th><th>Total</th></tr></thead><tbody>${rows}</tbody></table>
      <p><strong>Total: ${formatCurrency(invoice.total)}</strong> · Paid: ${formatCurrency(invoice.amount_paid)} · Balance due: ${formatCurrency(invoice.balance_due)}</p>
      ${paymentRows ? `<h2>Payments</h2><table><thead><tr><th>Date</th><th>Method</th><th>Amount</th></tr></thead><tbody>${paymentRows}</tbody></table>` : ""}
      </body></html>
    `);
    w.document.close();
    w.print();
  }

  return (
    <Button size="sm" variant="ghost" onClick={print}>
      <Printer className="h-4 w-4" /> Receipt
    </Button>
  );
}
