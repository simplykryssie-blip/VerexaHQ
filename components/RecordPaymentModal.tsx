"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Invoice } from "@/lib/types";
import CurrencyInput from "@/components/CurrencyInput";

const METHODS = ["Check", "ACH", "Cash", "Credit Card (manual)", "Other"];

export default function RecordPaymentModal({
  invoice,
  onClose,
  onSaved,
}: {
  invoice: Invoice;
  onClose: () => void;
  onSaved: () => void;
}) {
  const balanceDue = invoice.total_amount - invoice.amount_paid;
  const [amount, setAmount] = useState(balanceDue > 0 ? balanceDue.toFixed(2) : "");
  const [method, setMethod] = useState(METHODS[0]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const paymentAmount = parseFloat(amount) || 0;

    const { error: paymentError } = await supabase.from("invoice_payments").insert({
      workspace_id: invoice.workspace_id,
      invoice_id: invoice.id,
      client_id: invoice.client_id,
      payment_amount: paymentAmount,
      payment_status: "completed",
      payment_method: method,
      paid_at: new Date().toISOString(),
      notes,
      source_type: "manual_tracking",
    });

    if (paymentError) {
      setError(paymentError.message);
      setSaving(false);
      return;
    }

    const newAmountPaid = invoice.amount_paid + paymentAmount;
    const newStatus =
      newAmountPaid >= invoice.total_amount
        ? "paid"
        : newAmountPaid > 0
        ? "partially_paid"
        : invoice.invoice_status;

    const { error: invoiceError } = await supabase
      .from("invoices")
      .update({
        amount_paid: newAmountPaid,
        invoice_status: newStatus,
        paid_at: newStatus === "paid" ? new Date().toISOString() : null,
      })
      .eq("id", invoice.id);

    setSaving(false);
    if (invoiceError) {
      setError(invoiceError.message);
      return;
    }
    onSaved();
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-sm border border-line w-full max-w-sm p-6">
        <h3 className="font-slab text-lg font-bold text-ink mb-4">Record Payment</h3>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="text-sm text-muted">
            Balance due: <span className="font-mono font-semibold text-ink">${balanceDue.toFixed(2)}</span>
          </div>
          <CurrencyInput
            required
            placeholder="Amount received"
            value={amount}
            onChange={setAmount}
            className="w-full"
          />
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            className="w-full border border-line rounded-sm px-3 py-2 text-sm"
          >
            {METHODS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <textarea
            placeholder="Notes (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full border border-line rounded-sm px-3 py-2 text-sm"
          />
          <p className="text-xs text-muted">
            No payment processor is connected — this just logs that you
            received payment outside the app (check, cash, bank transfer, etc.).
          </p>

          {error && (
            <div className="text-xs text-brick bg-brick/10 border border-brick/30 rounded-sm px-3 py-2">
              {error}
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 text-sm font-semibold py-2 rounded-sm border border-line text-ink"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 text-sm font-semibold py-2 rounded-sm bg-ink text-white disabled:opacity-60"
            >
              {saving ? "Recording…" : "Record Payment"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
