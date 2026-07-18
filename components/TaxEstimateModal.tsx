"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import type { TaxEstimate } from "@/lib/types";

export default function TaxEstimateModal({
  clientId,
  taxYear,
  taxReturnId,
  estimate,
  onClose,
  onSaved,
  onDeleted,
}: {
  clientId: string;
  taxYear: number;
  taxReturnId?: string | null;
  estimate?: TaxEstimate;
  onClose: () => void;
  onSaved: () => void;
  onDeleted?: () => void;
}) {
  const isEditing = !!estimate;
  const [quarter, setQuarter] = useState(estimate?.quarter ?? "Q1");
  const [dueDate, setDueDate] = useState(estimate?.due_date ?? "");
  const [estimatedAmount, setEstimatedAmount] = useState(
    estimate?.estimated_amount?.toString() ?? ""
  );
  const [paymentStatus, setPaymentStatus] = useState(estimate?.payment_status ?? "pending");
  const [paidAmount, setPaidAmount] = useState(estimate?.paid_amount?.toString() ?? "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const payload = {
      quarter,
      due_date: dueDate || null,
      estimated_amount: estimatedAmount ? parseFloat(estimatedAmount) : null,
      payment_status: paymentStatus,
      paid_amount: paidAmount ? parseFloat(paidAmount) : null,
      paid_date: paymentStatus === "paid" ? new Date().toISOString().slice(0, 10) : null,
    };

    if (isEditing) {
      const { error } = await supabase
        .from("tax_estimates")
        .update(payload)
        .eq("id", estimate!.id);
      setSaving(false);
      if (error) {
        setError(error.message);
        return;
      }
      onSaved();
      onClose();
      return;
    }

    const { data: client } = await supabase
      .from("clients")
      .select("workspace_id")
      .eq("id", clientId)
      .maybeSingle();

    if (!client) {
      setError("Could not find that client's workspace.");
      setSaving(false);
      return;
    }

    const { error } = await supabase.from("tax_estimates").insert({
      workspace_id: client.workspace_id,
      client_id: clientId,
      tax_return_id: taxReturnId ?? null,
      tax_year: taxYear,
      ...payload,
    });

    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    onSaved();
    onClose();
  }

  async function handleDelete() {
    if (!estimate) return;
    if (!window.confirm(`Delete the ${estimate.quarter} estimate? This can't be undone.`)) return;
    setDeleting(true);
    const { error } = await supabase.from("tax_estimates").delete().eq("id", estimate.id);
    setDeleting(false);
    if (error) {
      setError(error.message);
      return;
    }
    onDeleted?.();
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-sm border border-line w-full max-w-sm p-6">
        <h3 className="font-slab text-lg font-bold text-ink mb-4">
          {isEditing ? "Edit Estimate" : "New Quarterly Estimate"}
        </h3>
        <form onSubmit={handleSubmit} className="space-y-3">
          <select
            value={quarter}
            onChange={(e) => setQuarter(e.target.value)}
            className="w-full border border-line rounded-sm px-3 py-2 text-sm"
          >
            <option>Q1</option>
            <option>Q2</option>
            <option>Q3</option>
            <option>Q4</option>
          </select>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="w-full border border-line rounded-sm px-3 py-2 text-sm"
          />
          <input
            type="number"
            step="0.01"
            placeholder="Estimated amount"
            value={estimatedAmount}
            onChange={(e) => setEstimatedAmount(e.target.value)}
            className="w-full border border-line rounded-sm px-3 py-2 text-sm"
          />
          <select
            value={paymentStatus}
            onChange={(e) => setPaymentStatus(e.target.value)}
            className="w-full border border-line rounded-sm px-3 py-2 text-sm"
          >
            <option value="pending">Pending</option>
            <option value="paid">Paid</option>
            <option value="late">Late</option>
            <option value="waived">Waived</option>
          </select>
          {paymentStatus === "paid" && (
            <input
              type="number"
              step="0.01"
              placeholder="Paid amount"
              value={paidAmount}
              onChange={(e) => setPaidAmount(e.target.value)}
              className="w-full border border-line rounded-sm px-3 py-2 text-sm"
            />
          )}

          {error && (
            <div className="text-xs text-brick bg-brick/10 border border-brick/30 rounded-sm px-3 py-2">
              {error}
            </div>
          )}

          <div className="flex gap-2 pt-2">
            {isEditing && (
              <button
                type="button"
                onClick={handleDelete}
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
              {saving ? "Saving…" : isEditing ? "Save Changes" : "Add Estimate"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
