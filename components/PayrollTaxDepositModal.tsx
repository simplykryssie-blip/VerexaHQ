"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import type { PayrollTaxDeposit } from "@/lib/types";
import CurrencyInput from "@/components/CurrencyInput";
import ConfirmDialog from "@/components/ConfirmDialog";

import { friendlyError } from "@/lib/friendlyError";
const TAX_TYPES = ["941 Deposit", "State Withholding", "SUTA", "FUTA", "Local"];
const STATUSES = ["scheduled", "paid", "late", "waived"];

export default function PayrollTaxDepositModal({
  payrollClientId,
  clientId,
  deposit,
  onClose,
  onSaved,
  onDeleted,
}: {
  payrollClientId: string;
  clientId: string;
  deposit?: PayrollTaxDeposit;
  onClose: () => void;
  onSaved: () => void;
  onDeleted?: () => void;
}) {
  const isEditing = !!deposit;
  const [taxType, setTaxType] = useState(deposit?.tax_type ?? TAX_TYPES[0]);
  const [jurisdiction, setJurisdiction] = useState(deposit?.jurisdiction ?? "Federal");
  const [dueDate, setDueDate] = useState(deposit?.due_date ?? "");
  const [amount, setAmount] = useState(deposit?.amount?.toString() ?? "");
  const [status, setStatus] = useState(deposit?.deposit_status ?? "scheduled");
  const [paymentReference, setPaymentReference] = useState(deposit?.payment_reference ?? "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const payload = {
      tax_type: taxType,
      jurisdiction,
      due_date: dueDate || null,
      amount: amount ? parseFloat(amount) : 0,
      deposit_status: status,
      payment_reference: paymentReference || null,
      paid_at: status === "paid" ? new Date().toISOString() : null,
    };

    if (isEditing) {
      const { error } = await supabase
        .from("payroll_tax_deposits")
        .update(payload)
        .eq("id", deposit!.id);
      setSaving(false);
      if (error) {
        setError(friendlyError(error, "Something went wrong. Please try again."));
        return;
      }
      onSaved();
      onClose();
      return;
    }

    const { error } = await supabase.from("payroll_tax_deposits").insert({
      payroll_client_id: payrollClientId,
      client_id: clientId,
      ...payload,
    });

    setSaving(false);
    if (error) {
      setError(friendlyError(error, "Something went wrong. Please try again."));
      return;
    }
    onSaved();
    onClose();
  }

  async function handleDelete() {
    if (!deposit) return;
    setDeleting(true);
    const { error } = await supabase.from("payroll_tax_deposits").delete().eq("id", deposit.id);
    setDeleting(false);
    setConfirmingDelete(false);
    if (error) {
      setError(friendlyError(error, "Something went wrong. Please try again."));
      return;
    }
    onDeleted?.();
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-sm border border-line w-full max-w-sm p-6">
        <h3 className="font-slab text-lg font-bold text-ink mb-4">
          {isEditing ? "Edit Tax Deposit" : "New Tax Deposit"}
        </h3>
        <form onSubmit={handleSubmit} className="space-y-3">
          <select
            value={taxType}
            onChange={(e) => setTaxType(e.target.value)}
            className="w-full border border-line rounded-sm px-3 py-2 text-sm"
          >
            {TAX_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <input
            placeholder="Jurisdiction"
            value={jurisdiction}
            onChange={(e) => setJurisdiction(e.target.value)}
            className="w-full border border-line rounded-sm px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-1/2 border border-line rounded-sm px-3 py-2 text-sm"
            />
            <CurrencyInput
              placeholder="Amount"
              value={amount}
              onChange={setAmount}
              className="w-1/2"
            />
          </div>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="w-full border border-line rounded-sm px-3 py-2 text-sm"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <input
            placeholder="Payment reference (optional)"
            value={paymentReference}
            onChange={(e) => setPaymentReference(e.target.value)}
            className="w-full border border-line rounded-sm px-3 py-2 text-sm"
          />
          <p className="text-xs text-muted">
            No payment processor is connected — record deposits here for
            tracking; actual EFTPS/state e-payment still happens outside this
            app until a provider is wired up.
          </p>

          {error && (
            <div className="text-xs text-brick bg-brick/10 border border-brick/30 rounded-sm px-3 py-2">
              {error}
            </div>
          )}

          <div className="flex gap-2 pt-2">
            {isEditing && (
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                disabled={deleting}
                className="text-sm font-semibold py-2 px-3 rounded-sm border border-brick text-brick disabled:opacity-60"
              >
                {deleting ? "Deleting…" : "Delete"}
              </button>
            )}
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
              {saving ? "Saving…" : isEditing ? "Save Changes" : "Create Deposit"}
            </button>
          </div>
        </form>
      </div>
      <ConfirmDialog
        open={confirmingDelete}
        title="Delete this tax deposit?"
        description="This can't be undone."
        confirmLabel="Delete"
        busy={deleting}
        onConfirm={handleDelete}
        onCancel={() => setConfirmingDelete(false)}
      />
    </div>
  );
}
