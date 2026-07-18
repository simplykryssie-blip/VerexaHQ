"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import type { PayrollRun } from "@/lib/types";

export default function PayrollRunModal({
  payrollClientId,
  clientId,
  run,
  onClose,
  onSaved,
  onDeleted,
}: {
  payrollClientId: string;
  clientId: string;
  run?: PayrollRun;
  onClose: () => void;
  onSaved: () => void;
  onDeleted?: () => void;
}) {
  const isEditing = !!run;
  const [periodStart, setPeriodStart] = useState(run?.pay_period_start ?? "");
  const [periodEnd, setPeriodEnd] = useState(run?.pay_period_end ?? "");
  const [payDate, setPayDate] = useState(run?.pay_date ?? "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const payload = {
      pay_period_start: periodStart || null,
      pay_period_end: periodEnd || null,
      pay_date: payDate || null,
    };

    if (isEditing) {
      const { error } = await supabase.from("payroll_runs").update(payload).eq("id", run!.id);
      setSaving(false);
      if (error) {
        setError(error.message);
        return;
      }
      onSaved();
      onClose();
      return;
    }

    const { error } = await supabase.from("payroll_runs").insert({
      payroll_client_id: payrollClientId,
      client_id: clientId,
      run_status: "draft",
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
    if (!run) return;
    if (!window.confirm("Delete this payroll run? All line items go with it.")) return;
    setDeleting(true);
    const { error } = await supabase.from("payroll_runs").delete().eq("id", run.id);
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
          {isEditing ? "Edit Payroll Run" : "New Payroll Run"}
        </h3>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="flex gap-2">
            <input
              type="date"
              value={periodStart}
              onChange={(e) => setPeriodStart(e.target.value)}
              className="w-1/2 border border-line rounded-sm px-3 py-2 text-sm"
            />
            <input
              type="date"
              value={periodEnd}
              onChange={(e) => setPeriodEnd(e.target.value)}
              className="w-1/2 border border-line rounded-sm px-3 py-2 text-sm"
            />
          </div>
          <input
            type="date"
            placeholder="Pay date"
            value={payDate}
            onChange={(e) => setPayDate(e.target.value)}
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
              {saving ? "Saving…" : isEditing ? "Save Changes" : "Create Run"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
