"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import type { PayrollFiling } from "@/lib/types";

const FILING_TYPES = ["941", "940", "W-2", "W-3", "State Withholding", "State Unemployment", "1099-NEC"];
const STATUSES = ["upcoming", "in_progress", "filed", "accepted", "rejected"];

export default function PayrollFilingModal({
  payrollClientId,
  clientId,
  filing,
  onClose,
  onSaved,
  onDeleted,
}: {
  payrollClientId: string;
  clientId: string;
  filing?: PayrollFiling;
  onClose: () => void;
  onSaved: () => void;
  onDeleted?: () => void;
}) {
  const isEditing = !!filing;
  const [filingType, setFilingType] = useState(filing?.filing_type ?? FILING_TYPES[0]);
  const [jurisdiction, setJurisdiction] = useState(filing?.jurisdiction ?? "Federal");
  const [dueDate, setDueDate] = useState(filing?.due_date ?? "");
  const [status, setStatus] = useState(filing?.filing_status ?? "upcoming");
  const [confirmationNumber, setConfirmationNumber] = useState(filing?.confirmation_number ?? "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const payload = {
      filing_type: filingType,
      jurisdiction,
      due_date: dueDate || null,
      filing_status: status,
      confirmation_number: confirmationNumber || null,
      filed_at: status === "filed" || status === "accepted" ? new Date().toISOString() : null,
    };

    if (isEditing) {
      const { error } = await supabase
        .from("payroll_filings")
        .update(payload)
        .eq("id", filing!.id);
      setSaving(false);
      if (error) {
        setError(error.message);
        return;
      }
      onSaved();
      onClose();
      return;
    }

    const { error } = await supabase.from("payroll_filings").insert({
      payroll_client_id: payrollClientId,
      client_id: clientId,
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
    if (!filing) return;
    if (!window.confirm("Delete this filing?")) return;
    setDeleting(true);
    const { error } = await supabase.from("payroll_filings").delete().eq("id", filing.id);
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
          {isEditing ? "Edit Filing" : "New Filing"}
        </h3>
        <form onSubmit={handleSubmit} className="space-y-3">
          <select
            value={filingType}
            onChange={(e) => setFilingType(e.target.value)}
            className="w-full border border-line rounded-sm px-3 py-2 text-sm"
          >
            {FILING_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <input
            placeholder="Jurisdiction (e.g. Federal, Louisiana)"
            value={jurisdiction}
            onChange={(e) => setJurisdiction(e.target.value)}
            className="w-full border border-line rounded-sm px-3 py-2 text-sm"
          />
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="w-full border border-line rounded-sm px-3 py-2 text-sm"
          />
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="w-full border border-line rounded-sm px-3 py-2 text-sm"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replaceAll("_", " ")}
              </option>
            ))}
          </select>
          <input
            placeholder="Confirmation number (optional)"
            value={confirmationNumber}
            onChange={(e) => setConfirmationNumber(e.target.value)}
            className="w-full border border-line rounded-sm px-3 py-2 text-sm"
          />

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
              {saving ? "Saving…" : isEditing ? "Save Changes" : "Create Filing"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
