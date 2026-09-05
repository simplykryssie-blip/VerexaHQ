"use client";

import { useState } from "react";
import Link from "next/link";
import { FileText, Receipt, DollarSign, AlertTriangle, Plus } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { Badge } from "@/components/ui/Badge";
import type { IconChipTone } from "@/components/ui/IconChip";
import { StatTile } from "@/components/ui/StatTile";
import { Modal } from "@/components/Modal";
import { BILLING_DOCUMENT_STATUS_TONE, PAYMENT_STATUS_TONE } from "@/lib/billingStatus";
import { InvoiceQuoteForm, type EditingInvoiceQuote } from "./InvoiceQuoteForm";
import { PreviewButton } from "./PreviewButton";
import { NewBillingDocumentModal } from "./NewBillingDocumentModal";
import { ReactivateQuoteButton } from "./ReactivateQuoteButton";

function money(n: number) {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export type BillingQuoteRow = {
  id: string;
  quote_number: string | null;
  title: string;
  status: string;
  total_amount: number;
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  line_items: { description: string; quantity: number; unit_price: number }[];
  created_at: string;
  valid_until: string | null;
  notes: string | null;
  client_id: string;
  client_name: string;
};

export type BillingInvoiceRow = {
  id: string;
  invoice_number: string | null;
  status: string;
  total_amount: number;
  amount_paid: number;
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  line_items: { description: string; quantity: number; unit_price: number }[];
  issue_date: string | null;
  due_date: string | null;
  notes: string | null;
  client_id: string;
  client_name: string;
};

export type BillingPaymentRow = {
  id: string;
  status: string;
  amount: number;
  payment_date: string;
  payment_method: string | null;
  client_id: string;
  client_name: string;
};

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  stripe: "Card",
  check: "Check",
  cash: "Cash",
  bank_transfer: "Bank transfer",
  other: "Other",
};

const TABS = ["Quotes", "Invoices", "Payments"] as const;
type Tab = (typeof TABS)[number];

export function BillingHub({
  workspaceId,
  workspaceName,
  quotes,
  invoices,
  payments,
  services,
  canManage,
  initialUnpaidOnly = false,
}: {
  workspaceId: string;
  workspaceName: string;
  quotes: BillingQuoteRow[];
  invoices: BillingInvoiceRow[];
  payments: BillingPaymentRow[];
  services: { id: string; name: string }[];
  canManage: boolean;
  /** Set when the dashboard's "Outstanding Invoices" KPI links here with
   *  ?filter=unpaid -- opens straight on the Invoices tab pre-filtered to
   *  the same outstanding-balance set that KPI counted, instead of landing
   *  on the unfiltered hub and making staff re-find what they clicked for. */
  initialUnpaidOnly?: boolean;
}) {
  const [tab, setTab] = useState<Tab>("Invoices");
  const [unpaidOnly, setUnpaidOnly] = useState(initialUnpaidOnly);
  const [creating, setCreating] = useState<"invoice" | "quote" | null>(null);
  const [editingQuote, setEditingQuote] = useState<BillingQuoteRow | null>(null);
  const [editingInvoice, setEditingInvoice] = useState<BillingInvoiceRow | null>(null);

  const outstandingInvoices = invoices.filter((i) => i.status !== "paid" && i.status !== "void");
  const outstandingBalance = outstandingInvoices.reduce((sum, i) => sum + Math.max(i.total_amount - i.amount_paid, 0), 0);
  const overdue = outstandingInvoices.filter((i) => i.due_date && new Date(i.due_date) < new Date());
  const overdueTotal = overdue.reduce((sum, i) => sum + Math.max(i.total_amount - i.amount_paid, 0), 0);
  const now = new Date();
  const revenueThisMonth = payments
    .filter((p) => p.status === "succeeded" && new Date(p.payment_date).getMonth() === now.getMonth() && new Date(p.payment_date).getFullYear() === now.getFullYear())
    .reduce((sum, p) => sum + p.amount, 0);
  const pendingQuotes = quotes.filter((q) => q.status === "sent");

  const stats: { label: string; value: string; chip: IconChipTone; icon: typeof DollarSign }[] = [
    { label: "Revenue this month", value: money(revenueThisMonth), chip: "emerald", icon: DollarSign },
    { label: "Outstanding balance", value: money(outstandingBalance), chip: "accent", icon: Receipt },
    { label: "Overdue", value: `${overdue.length} (${money(overdueTotal)})`, chip: "rose", icon: AlertTriangle },
    { label: "Pending quotes", value: String(pendingQuotes.length), chip: "violet", icon: FileText },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {stats.map((s) => (
          <StatTile key={s.label} icon={s.icon} tone={s.chip} label={s.label} value={s.value} />
        ))}
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 rounded-lg border border-border bg-surface p-1 text-sm">
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`rounded-md px-3 py-1.5 font-medium transition ${tab === t ? "bg-accent text-white" : "text-muted hover:text-ink"}`}
            >
              {t}
            </button>
          ))}
        </div>
        {canManage && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCreating("quote")}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-slate hover:border-accent hover:text-accent"
            >
              <Plus size={14} /> New quote
            </button>
            <button
              type="button"
              onClick={() => setCreating("invoice")}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/90"
            >
              <Plus size={14} /> New invoice
            </button>
          </div>
        )}
      </div>

      {tab === "Quotes" && (
        <div className="rounded-2xl border border-border bg-surface shadow-soft">
          {quotes.length === 0 ? (
            <EmptyState message="No quotes yet." />
          ) : (
            <ul className="divide-y divide-border">
              {quotes.map((q) => (
                <li key={q.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm transition-colors hover:bg-surfaceMuted">
                  <div className="min-w-0">
                    <Link href={`/clients/${q.client_id}`} className="font-medium text-accent hover:underline">
                      {q.client_name}
                    </Link>
                    <p className="text-xs text-muted">
                      {q.quote_number ?? "Quote"} -- {q.title}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge tone={BILLING_DOCUMENT_STATUS_TONE[q.status] ?? "neutral"} className="capitalize">
                      {q.status}
                    </Badge>
                    <span className="text-slate">{money(q.total_amount)}</span>
                    {canManage && q.status === "cancelled" && <ReactivateQuoteButton quoteId={q.id} />}
                    {canManage && (
                      <button type="button" onClick={() => setEditingQuote(q)} className="text-xs font-medium text-accent hover:underline">
                        Edit
                      </button>
                    )}
                    <PreviewButton
                      kind="quote"
                      workspaceId={workspaceId}
                      firmName={workspaceName}
                      clientName={q.client_name}
                      number={q.quote_number}
                      issueDate={q.created_at}
                      dueDate={q.valid_until}
                      lineItems={q.line_items}
                      subtotal={q.subtotal}
                      discountAmount={q.discount_amount}
                      taxAmount={q.tax_amount}
                      totalAmount={q.total_amount}
                      notes={q.notes}
                      status={q.status}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === "Invoices" && (
        <div className="rounded-2xl border border-border bg-surface shadow-soft">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <button
              type="button"
              onClick={() => setUnpaidOnly((v) => !v)}
              aria-pressed={unpaidOnly}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition ${
                unpaidOnly ? "border-accent bg-accentSoft text-accent" : "border-border text-muted hover:border-accent hover:text-accent"
              }`}
            >
              Unpaid only {unpaidOnly && `(${outstandingInvoices.length})`}
            </button>
          </div>
          {(unpaidOnly ? outstandingInvoices : invoices).length === 0 ? (
            <EmptyState message={unpaidOnly ? "No outstanding invoices -- everything's paid up." : "No invoices yet."} />
          ) : (
            <ul className="divide-y divide-border">
              {(unpaidOnly ? outstandingInvoices : invoices).map((i) => (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm transition-colors hover:bg-surfaceMuted">
                  <div className="min-w-0">
                    <Link href={`/clients/${i.client_id}`} className="font-medium text-accent hover:underline">
                      {i.client_name}
                    </Link>
                    <p className="text-xs text-muted">{i.invoice_number ?? "Invoice"}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge tone={BILLING_DOCUMENT_STATUS_TONE[i.status] ?? "neutral"} className="capitalize">
                      {i.status}
                    </Badge>
                    <span className="text-slate">
                      {money(i.total_amount)} ({money(i.amount_paid)} paid)
                    </span>
                    {canManage && (
                      <button type="button" onClick={() => setEditingInvoice(i)} className="text-xs font-medium text-accent hover:underline">
                        Edit
                      </button>
                    )}
                    <PreviewButton
                      kind="invoice"
                      workspaceId={workspaceId}
                      firmName={workspaceName}
                      clientName={i.client_name}
                      number={i.invoice_number}
                      issueDate={i.issue_date}
                      dueDate={i.due_date}
                      lineItems={i.line_items}
                      subtotal={i.subtotal}
                      discountAmount={i.discount_amount}
                      taxAmount={i.tax_amount}
                      totalAmount={i.total_amount}
                      notes={i.notes}
                      status={i.status}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === "Payments" && (
        <div className="rounded-2xl border border-border bg-surface shadow-soft">
          {payments.length === 0 ? (
            <EmptyState message="No payments recorded yet." />
          ) : (
            <ul className="divide-y divide-border">
              {payments.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm transition-colors hover:bg-surfaceMuted">
                  <div className="min-w-0">
                    <Link href={`/clients/${p.client_id}`} className="font-medium text-accent hover:underline">
                      {p.client_name}
                    </Link>
                    <p className="text-xs text-muted">
                      {new Date(p.payment_date).toLocaleDateString()}
                      {p.payment_method && ` -- ${PAYMENT_METHOD_LABEL[p.payment_method] ?? p.payment_method}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge tone={PAYMENT_STATUS_TONE[p.status] ?? "neutral"} className="capitalize">
                      {p.status}
                    </Badge>
                    <span className="text-slate">{money(p.amount)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {creating && (
        <NewBillingDocumentModal
          kind={creating}
          workspaceId={workspaceId}
          firmName={workspaceName}
          services={services}
          onClose={() => setCreating(null)}
        />
      )}

      {editingQuote && (
        <Modal title={`Edit ${editingQuote.quote_number ?? "quote"}`} onClose={() => setEditingQuote(null)} size="xl">
          <InvoiceQuoteForm
            kind="quote"
            workspaceId={workspaceId}
            clientId={editingQuote.client_id}
            firmName={workspaceName}
            clientName={editingQuote.client_name}
            editing={editingQuote as EditingInvoiceQuote}
            services={services}
            onDone={() => setEditingQuote(null)}
          />
        </Modal>
      )}

      {editingInvoice && (
        <Modal title={`Edit ${editingInvoice.invoice_number ?? "invoice"}`} onClose={() => setEditingInvoice(null)} size="xl">
          <InvoiceQuoteForm
            kind="invoice"
            workspaceId={workspaceId}
            clientId={editingInvoice.client_id}
            firmName={workspaceName}
            clientName={editingInvoice.client_name}
            editing={editingInvoice as EditingInvoiceQuote}
            services={services}
            onDone={() => setEditingInvoice(null)}
          />
        </Modal>
      )}
    </div>
  );
}
