"use client";

import { useEffect, useState } from "react";
import { authenticatedFetch } from "@/lib/authenticatedFetch";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Plus, DollarSign, Trash2, CalendarClock } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type {
  Invoice,
  InvoiceLineItem,
  InvoicePayment,
  Client,
  InvoicePaymentPlan,
  PaymentPlanSchedule,
} from "@/lib/types";
import StatusPill from "@/components/StatusPill";
import InvoiceLineItemModal from "@/components/InvoiceLineItemModal";
import RecordPaymentModal from "@/components/RecordPaymentModal";
import PaymentPlanModal from "@/components/PaymentPlanModal";
import ConfirmDialog from "@/components/ConfirmDialog";
import { useToast } from "@/components/Toast";
import { sendEmail, getProviderStatus } from "@/lib/notify";
import { friendlyError } from "@/lib/friendlyError";

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [lineItems, setLineItems] = useState<InvoiceLineItem[]>([]);
  const [payments, setPayments] = useState<InvoicePayment[]>([]);
  const [paymentPlan, setPaymentPlan] = useState<InvoicePaymentPlan | null>(null);
  const [schedules, setSchedules] = useState<PaymentPlanSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showItemModal, setShowItemModal] = useState(false);
  const [editingItem, setEditingItem] = useState<InvoiceLineItem | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [emailConfigured, setEmailConfigured] = useState(false);
  const [stripeConfigured, setStripeConfigured] = useState(false);
  const [creatingPaymentLink, setCreatingPaymentLink] = useState(false);
  const [deleteItemTarget, setDeleteItemTarget] = useState<InvoiceLineItem | null>(null);
  const [deletingItem, setDeletingItem] = useState(false);
  const { showSuccess } = useToast();

  useEffect(() => {
    getProviderStatus().then((s) => {
      setEmailConfigured(s.email);
      setStripeConfigured(s.stripe);
    });
  }, []);

  async function load() {
    setLoading(true);
    const { data: invoiceData, error: invoiceError } = await supabase
      .from("invoices")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (invoiceError || !invoiceData) {
      setError(invoiceError?.message ?? "Invoice not found.");
      setLoading(false);
      return;
    }

    const inv = invoiceData as Invoice;
    setInvoice(inv);

    const [clientRes, itemsRes, paymentsRes, planRes, schedulesRes] = await Promise.all([
      supabase.from("clients").select("*").eq("id", inv.client_id).maybeSingle(),
      supabase
        .from("invoice_line_items")
        .select("*")
        .eq("invoice_id", inv.id)
        .order("sort_order"),
      supabase
        .from("invoice_payments")
        .select("*")
        .eq("invoice_id", inv.id)
        .order("created_at", { ascending: false }),
      supabase.from("invoice_payment_plans").select("*").eq("invoice_id", inv.id).maybeSingle(),
      supabase
        .from("payment_plan_schedules")
        .select("*")
        .eq("invoice_id", inv.id)
        .order("installment_number"),
    ]);

    const items = (itemsRes.data as InvoiceLineItem[]) ?? [];
    setClient((clientRes.data as Client) ?? null);
    setLineItems(items);
    setPayments((paymentsRes.data as InvoicePayment[]) ?? []);
    setPaymentPlan((planRes.data as InvoicePaymentPlan) ?? null);
    setSchedules((schedulesRes.data as PaymentPlanSchedule[]) ?? []);
    setError(null);
    setLoading(false);

    const subtotal = items.reduce((s, i) => s + Number(i.line_total), 0);
    const newTotal = subtotal + inv.tax_amount - inv.discount_amount;
    if (subtotal !== inv.subtotal || newTotal !== inv.total_amount) {
      await supabase
        .from("invoices")
        .update({ subtotal, total_amount: newTotal })
        .eq("id", inv.id);
      setInvoice({ ...inv, subtotal, total_amount: newTotal });
    }
  }

  useEffect(() => {
    if (id) load();
  }, [id]);

  async function confirmDeleteItem() {
    if (!deleteItemTarget) return;
    setDeletingItem(true);
    const { error } = await supabase.from("invoice_line_items").delete().eq("id", deleteItemTarget.id);
    setDeletingItem(false);
    setDeleteItemTarget(null);
    if (!error) {
      showSuccess("Line item removed.");
      load();
    }
  }

  async function markSent() {
    if (!invoice) return;
    const { error } = await supabase
      .from("invoices")
      .update({ invoice_status: "sent", sent_at: new Date().toISOString() })
      .eq("id", invoice.id);
    if (error) return;

    if (emailConfigured && client?.email) {
      const itemsHtml = lineItems
        .map(
          (it) =>
            `<tr><td>${it.item_name}</td><td>${it.quantity}</td><td>$${Number(
              it.unit_price
            ).toFixed(2)}</td><td>$${Number(it.line_total).toFixed(2)}</td></tr>`
        )
        .join("");
      await sendEmail(
        client.email,
        `Invoice${invoice.invoice_number ? ` ${invoice.invoice_number}` : ""} from your accountant`,
        `<p>Hi ${client.first_name || ""},</p>
         <p>Your invoice is ready. Total due: <strong>$${invoice.total_amount.toFixed(2)}</strong>
         ${invoice.due_date ? ` by ${invoice.due_date}` : ""}.</p>
         <table border="1" cellpadding="6" style="border-collapse:collapse">
           <tr><th>Item</th><th>Qty</th><th>Rate</th><th>Total</th></tr>
           ${itemsHtml}
         </table>
         ${invoice.payment_collection_mode !== "external_tracking" ? "" : "<p>Please reach out to arrange payment.</p>"}`
      );
    }
    load();
  }

  async function createStripePaymentLink() {
    if (!invoice) return;
    setCreatingPaymentLink(true);
    setError(null);
    try {
      const res = await authenticatedFetch("/api/stripe/create-payment-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId: invoice.id }),
      });
      const result = await res.json();
      if (!result.ok) {
        setError(result.reason ?? result.error ?? "Could not create payment link.");
        setCreatingPaymentLink(false);
        return;
      }
      window.open(result.url, "_blank");
      load();
    } finally {
      setCreatingPaymentLink(false);
    }
  }

  async function reloadAndSync() {
    await load();
  }

  async function markInstallmentPaid(schedule: PaymentPlanSchedule) {
    if (!invoice) return;
    const nextStatus = schedule.status === "paid" ? "pending" : "paid";
    const { error } = await supabase
      .from("payment_plan_schedules")
      .update({
        status: nextStatus,
        paid_date: nextStatus === "paid" ? new Date().toISOString().slice(0, 10) : null,
      })
      .eq("id", schedule.id);
    if (error) return;

    if (nextStatus === "paid") {
      const { error: paymentError } = await supabase.from("invoice_payments").insert({
        workspace_id: invoice.workspace_id,
        invoice_id: invoice.id,
        client_id: invoice.client_id,
        payment_amount: schedule.amount,
        payment_status: "succeeded",
        payment_method: "Payment Plan Installment",
        paid_at: new Date().toISOString(),
        source_type: "manual_tracking",
      });
      if (paymentError) {
        setError(friendlyError(paymentError, "Something went wrong. Please try again."));
        return;
      }
      const newAmountPaid = invoice.amount_paid + Number(schedule.amount);
      const { error: invoiceError } = await supabase
        .from("invoices")
        .update({
          amount_paid: newAmountPaid,
          invoice_status: newAmountPaid >= invoice.total_amount ? "paid" : "partial",
        })
        .eq("id", invoice.id);
      if (invoiceError) {
        setError(friendlyError(invoiceError, "Something went wrong. Please try again."));
        return;
      }
    }
    load();
  }

  if (loading) return <div className="text-sm text-muted">Loading invoice…</div>;

  if (error || !invoice) {
    return (
      <div className="text-sm text-brick bg-brick/10 border border-brick/30 rounded-sm px-4 py-3">
        {error ?? "Not found."}
      </div>
    );
  }

  const clientName = client
    ? client.client_type === "business" && client.business_name
      ? client.business_name
      : `${client.first_name} ${client.last_name}`.trim()
    : "—";
  const balanceDue = invoice.total_amount - invoice.amount_paid;

  return (
    <div>
      <button
        onClick={() => router.push("/billing")}
        className="flex items-center gap-1.5 text-xs text-muted mb-4 hover:text-ink"
      >
        <ArrowLeft size={13} /> Back to Invoices
      </button>

      <div className="flex items-center gap-3 mb-2">
        <h1 className="font-slab text-2xl font-bold text-ink">
          {clientName} {invoice.invoice_number ? `— ${invoice.invoice_number}` : ""}
        </h1>
        <StatusPill status={invoice.invoice_status.replaceAll("_", " ")} />
      </div>
      <div className="text-sm text-muted mb-6">
        Issued {invoice.issue_date} · Due {invoice.due_date ?? "—"}
      </div>

      <div className="flex items-center gap-2 mb-8">
        {invoice.invoice_status === "draft" && (
          <button
            onClick={markSent}
            className="text-xs font-semibold px-3 py-1.5 rounded-sm bg-ink text-white"
          >
            Mark as Sent
          </button>
        )}
        {balanceDue > 0 && (
          <button
            onClick={() => setShowPaymentModal(true)}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-sm border border-line text-ink"
          >
            <DollarSign size={13} /> Record Payment
          </button>
        )}
        {balanceDue > 0 && stripeConfigured && (
          <button
            onClick={createStripePaymentLink}
            disabled={creatingPaymentLink}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-sm bg-ink text-white disabled:opacity-60"
          >
            {creatingPaymentLink ? "Creating…" : "Get Payment Link"}
          </button>
        )}
        {invoice.external_payment_url && (
          <a
            href={invoice.external_payment_url}
            target="_blank"
            rel="noreferrer"
            className="text-xs font-semibold text-ink underline"
          >
            View Payment Link
          </a>
        )}
        {balanceDue > 0 && !paymentPlan && (
          <button
            onClick={() => setShowPlanModal(true)}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-sm border border-line text-ink"
          >
            <CalendarClock size={13} /> Set Up Payment Plan
          </button>
        )}
      </div>

      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-white border border-line rounded-sm p-4">
          <div className="text-[11px] uppercase tracking-widest text-muted font-semibold mb-1">
            Total
          </div>
          <div className="text-lg font-bold font-mono tabular-nums text-ink">
            ${invoice.total_amount.toLocaleString()}
          </div>
        </div>
        <div className="bg-white border border-line rounded-sm p-4">
          <div className="text-[11px] uppercase tracking-widest text-muted font-semibold mb-1">
            Paid
          </div>
          <div className="text-lg font-bold font-mono tabular-nums text-green">
            ${invoice.amount_paid.toLocaleString()}
          </div>
        </div>
        <div className="bg-white border border-line rounded-sm p-4">
          <div className="text-[11px] uppercase tracking-widest text-muted font-semibold mb-1">
            Balance Due
          </div>
          <div className="text-lg font-bold font-mono tabular-nums text-brick">
            ${balanceDue.toLocaleString()}
          </div>
        </div>
      </div>

      {paymentPlan && (
        <section className="mb-8">
          <div className="border-b border-line pb-3 mb-4">
            <h2 className="font-slab text-lg font-bold text-ink">Payment Plan</h2>
            <p className="text-xs text-muted mt-1">
              {paymentPlan.installment_count} installments of $
              {Number(paymentPlan.installment_amount).toFixed(2)}, {paymentPlan.frequency}
            </p>
          </div>
          <div className="bg-white border border-line rounded-sm divide-y divide-paperDim">
            {schedules.map((s) => (
              <div key={s.id} className="flex items-center justify-between px-5 py-3.5">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={s.status === "paid"}
                    onChange={() => markInstallmentPaid(s)}
                    className="w-4 h-4 accent-[#0D1B2A]"
                  />
                  <span
                    className="text-sm font-semibold text-ink"
                    style={{
                      textDecoration: s.status === "paid" ? "line-through" : "none",
                      opacity: s.status === "paid" ? 0.5 : 1,
                    }}
                  >
                    Installment {s.installment_number}
                  </span>
                </label>
                <div className="flex items-center gap-4">
                  <span className="text-xs font-mono text-muted">Due {s.due_date}</span>
                  <span className="text-sm font-mono tabular-nums text-ink">
                    ${Number(s.amount).toLocaleString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="mb-8">
        <div className="flex items-center justify-between border-b border-line pb-3 mb-4">
          <h2 className="font-slab text-lg font-bold text-ink">Line Items</h2>
          <button
            onClick={() => setShowItemModal(true)}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-sm border border-line text-ink"
          >
            <Plus size={13} /> Add
          </button>
        </div>
        <div className="bg-white border border-line rounded-sm divide-y divide-paperDim">
          {lineItems.length === 0 && (
            <div className="px-5 py-5 text-sm text-muted">No line items yet.</div>
          )}
          {lineItems.map((it) => (
            <div key={it.id} className="flex items-center justify-between px-5 py-3.5">
              <button
                onClick={() => setEditingItem(it)}
                className="text-left flex-1"
              >
                <div className="font-semibold text-ink text-sm">{it.item_name}</div>
                <div className="text-xs text-muted mt-0.5">
                  {it.quantity} × ${Number(it.unit_price).toLocaleString()}
                </div>
              </button>
              <div className="flex items-center gap-3">
                <span className="text-sm font-mono tabular-nums text-ink">
                  ${Number(it.line_total).toLocaleString()}
                </span>
                <button
                  onClick={() => setDeleteItemTarget(it)}
                  className="text-muted hover:text-brick"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="border-b border-line pb-3 mb-4">
          <h2 className="font-slab text-lg font-bold text-ink">Payment History</h2>
        </div>
        <div className="bg-white border border-line rounded-sm divide-y divide-paperDim">
          {payments.length === 0 && (
            <div className="px-5 py-5 text-sm text-muted">No payments recorded yet.</div>
          )}
          {payments.map((p) => (
            <div key={p.id} className="flex items-center justify-between px-5 py-3.5">
              <div>
                <div className="font-semibold text-ink text-sm">{p.payment_method}</div>
                <div className="text-xs text-muted mt-0.5">
                  {p.paid_at ? new Date(p.paid_at).toLocaleDateString() : "—"}
                </div>
              </div>
              <span className="text-sm font-mono tabular-nums text-green">
                +${Number(p.payment_amount).toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      </section>

      {showItemModal && (
        <InvoiceLineItemModal
          invoiceId={invoice.id}
          workspaceId={invoice.workspace_id}
          onClose={() => setShowItemModal(false)}
          onSaved={reloadAndSync}
        />
      )}
      {editingItem && (
        <InvoiceLineItemModal
          invoiceId={invoice.id}
          workspaceId={invoice.workspace_id}
          item={editingItem}
          onClose={() => setEditingItem(null)}
          onSaved={reloadAndSync}
          onDeleted={reloadAndSync}
        />
      )}
      {showPaymentModal && (
        <RecordPaymentModal
          invoice={invoice}
          onClose={() => setShowPaymentModal(false)}
          onSaved={load}
        />
      )}
      {showPlanModal && (
        <PaymentPlanModal
          invoice={invoice}
          onClose={() => setShowPlanModal(false)}
          onSaved={load}
        />
      )}
      <ConfirmDialog
        open={!!deleteItemTarget}
        title={`Remove "${deleteItemTarget?.item_name ?? ""}"?`}
        description="This can't be undone."
        confirmLabel="Remove"
        busy={deletingItem}
        onConfirm={confirmDeleteItem}
        onCancel={() => setDeleteItemTarget(null)}
      />
    </div>
  );
}
