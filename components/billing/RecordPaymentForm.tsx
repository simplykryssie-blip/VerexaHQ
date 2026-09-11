"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";

type PendingInstallment = { id: string; installment_number: number; amount: number; due_date: string };

export function RecordPaymentForm({
  invoiceId,
  workspaceId,
  clientId,
  balanceDue,
  pendingInstallments = [],
}: {
  invoiceId: string;
  workspaceId: string;
  clientId: string;
  balanceDue: number;
  /** Open (status = 'pending') payment_plans rows for this invoice, if any --
   * lets staff mark a manual payment as satisfying a specific installment.
   * Without this, a manually-recorded payment only ever updates the invoice
   * (via apply_payment_to_invoice()); nothing links it to a payment plan, so
   * payment_plan.installment_paid can never fire for a manual payment --
   * only Stripe Checkout's webhook did that. */
  pendingInstallments?: PendingInstallment[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(balanceDue.toFixed(2));
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [paymentMethod, setPaymentMethod] = useState<"check" | "cash" | "bank_transfer" | "other">("check");
  const [reference, setReference] = useState("");
  const [installmentId, setInstallmentId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function selectInstallment(id: string) {
    setInstallmentId(id);
    const installment = pendingInstallments.find((p) => p.id === id);
    if (installment) setAmount(installment.amount.toFixed(2));
  }

  async function record(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const amountNum = Number(amount);
    if (!amountNum || amountNum <= 0) {
      setError("Enter a payment amount greater than zero.");
      return;
    }
    setSaving(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { data: payment, error: insertError } = await supabase
      .from("payments")
      .insert({
        workspace_id: workspaceId,
        client_id: clientId,
        invoice_id: invoiceId,
        amount: amountNum,
        payment_date: paymentDate,
        payment_method: paymentMethod,
        reference: reference || null,
        recorded_by: user?.id,
      })
      .select("id")
      .single();

    if (insertError || !payment) {
      setSaving(false);
      setError(insertError?.message ?? "Could not record the payment.");
      return;
    }

    if (installmentId) {
      const { error: linkError } = await supabase.rpc("apply_manual_payment_to_installment", {
        p_payment_id: payment.id,
        p_payment_plan_id: installmentId,
      });
      if (linkError) {
        setSaving(false);
        toast.show(`Payment recorded, but couldn't mark the installment paid: ${linkError.message}`, "error");
        setOpen(false);
        router.refresh();
        return;
      }
    }

    setSaving(false);
    toast.show("Payment recorded", "success");
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-xs font-medium text-accent hover:underline">
        Record payment
      </button>
    );
  }

  return (
    <form onSubmit={record} className="mt-2 flex flex-wrap items-end gap-2 rounded-lg border border-border bg-surfaceMuted p-3">
      {pendingInstallments.length > 0 && (
        <label className="flex flex-col gap-1 text-xs text-muted">
          Apply to
          <select
            value={installmentId}
            onChange={(e) => selectInstallment(e.target.value)}
            className="rounded-lg border border-border px-2 py-1.5 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          >
            <option value="">General payment</option>
            {pendingInstallments
              .sort((a, b) => a.installment_number - b.installment_number)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  Installment {p.installment_number} -- ${p.amount.toFixed(2)}
                </option>
              ))}
          </select>
        </label>
      )}
      <label className="flex flex-col gap-1 text-xs text-muted">
        Amount
        <input
          required
          type="number"
          min={0.01}
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-28 rounded-lg border border-border px-2 py-1.5 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Date
        <input
          required
          type="date"
          value={paymentDate}
          onChange={(e) => setPaymentDate(e.target.value)}
          className="rounded-lg border border-border px-2 py-1.5 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Method
        <select
          value={paymentMethod}
          onChange={(e) => setPaymentMethod(e.target.value as typeof paymentMethod)}
          className="rounded-lg border border-border px-2 py-1.5 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        >
          <option value="check">Check</option>
          <option value="cash">Cash</option>
          <option value="bank_transfer">Bank transfer</option>
          <option value="other">Other</option>
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Reference (optional)
        <input
          type="text"
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          placeholder="Check #, last 4, etc."
          className="rounded-lg border border-border px-2 py-1.5 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />
      </label>
      {error && <p className="w-full text-sm text-danger">{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={() => setOpen(false)} className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate hover:bg-surface">
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/90 disabled:opacity-60"
        >
          {saving ? "Recording..." : "Record payment"}
        </button>
      </div>
    </form>
  );
}
