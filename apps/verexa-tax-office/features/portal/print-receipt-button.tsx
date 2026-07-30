"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { paymentMethodLabel } from "@/lib/validation/billing";

type ReceiptInvoice = { invoice_number: string; total: number | string | null; amount_paid: number | string | null; balance_due: number | string | null };
type ReceiptItem = { description: string; quantity: number | string | null; unit_price: number | string | null; line_total: number | string | null };
type ReceiptPayment = { status: string; paid_at: string | null; created_at: string; method: string; amount: number | string | null };

// Deliberately narrow, client-safe prop shapes — never pass full DB rows
// (e.g. Tables<"invoices">/Tables<"payments">) into this "use client"
// component, since every field on a prop serializes into the page's RSC
// payload regardless of whether it's rendered, and those tables carry
// staff-only notes columns that must never reach a portal user's browser.
export function PrintReceiptButton({
  invoice,
  items,
  payments,
  clientName,
}: {
  invoice: ReceiptInvoice;
  items: ReceiptItem[];
  payments: ReceiptPayment[];
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
    <Button size="sm" variant="outline" onClick={print}>
      <Printer className="h-4 w-4" /> Receipt
    </Button>
  );
}
