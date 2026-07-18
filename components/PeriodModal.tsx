"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import type { BookkeepingPeriod } from "@/lib/types";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default function PeriodModal({
  clientId,
  engagementId,
  period,
  onClose,
  onSaved,
  onDeleted,
}: {
  clientId: string;
  engagementId: string;
  period?: BookkeepingPeriod;
  onClose: () => void;
  onSaved: () => void;
  onDeleted?: () => void;
}) {
  const isEditing = !!period;
  const now = new Date();
  const [month, setMonth] = useState(period?.period_month ?? now.getMonth() + 1);
  const [year, setYear] = useState(period?.period_year ?? now.getFullYear());
  const [dueDate, setDueDate] = useState(period?.due_date ?? "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const periodStart = `${year}-${String(month).padStart(2, "0")}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const periodEnd = `${year}-${String(month).padStart(2, "0")}-${lastDay}`;

    const payload = {
      period_month: month,
      period_year: year,
      period_start: periodStart,
      period_end: periodEnd,
      due_date: dueDate || null,
    };

    if (isEditing) {
      const { error } = await supabase
        .from("bookkeeping_periods")
        .update(payload)
        .eq("id", period!.id);
      setSaving(false);
      if (error) {
        setError(error.message);
        return;
      }
      onSaved();
      onClose();
      return;
    }

    const { error } = await supabase.from("bookkeeping_periods").insert({
      client_id: clientId,
      engagement_id: engagementId,
      period_status: "open",
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
    if (!period) return;
    if (!window.confirm("Delete this period? Transactions linked to it will remain but lose their period link.")) return;
    setDeleting(true);
    const { error } = await supabase.from("bookkeeping_periods").delete().eq("id", period.id);
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
          {isEditing ? "Edit Period" : "New Bookkeeping Period"}
        </h3>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="flex gap-2">
            <select
              value={month}
              onChange={(e) => setMonth(parseInt(e.target.value, 10))}
              className="w-2/3 border border-line rounded-sm px-3 py-2 text-sm"
            >
              {MONTHS.map((m, idx) => (
                <option key={m} value={idx + 1}>
                  {m}
                </option>
              ))}
            </select>
            <input
              type="number"
              value={year}
              onChange={(e) => setYear(parseInt(e.target.value, 10))}
              className="w-1/3 border border-line rounded-sm px-3 py-2 text-sm"
            />
          </div>
          <input
            type="date"
            placeholder="Due date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="w-full border border-line rounded-sm px-3 py-2 text-sm"
          />
          <p className="text-xs text-muted">
            Due date is when reports should go to the client (optional).
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
              {saving ? "Saving…" : isEditing ? "Save Changes" : "Create Period"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
