"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";

type StaffOption = { id: string; label: string };
type TimeOffRow = { id: string; user_id: string; start_date: string; end_date: string; reason: string | null };

const inputClass = "rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent";

export function MyAvailabilityManager({
  workspaceId,
  currentUserId,
  staff,
  timeOff,
  canManageOthers,
}: {
  workspaceId: string;
  currentUserId: string | null;
  staff: StaffOption[];
  timeOff: TimeOffRow[];
  canManageOthers: boolean;
}) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const staffLabel = new Map(staff.map((s) => [s.id, s.label]));

  const [forUserId, setForUserId] = useState(currentUserId ?? "");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function addTimeOff(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!forUserId || !startDate || !endDate) {
      setError("Pick who this is for and a start and end date.");
      return;
    }
    if (endDate < startDate) {
      setError("End date can't be before the start date.");
      return;
    }
    setSaving(true);
    const { error: insertError } = await supabase.from("staff_time_off").insert({
      workspace_id: workspaceId,
      user_id: forUserId,
      start_date: startDate,
      end_date: endDate,
      reason: reason.trim() || null,
      created_by: currentUserId,
    });
    setSaving(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setStartDate("");
    setEndDate("");
    setReason("");
    toast.show("Time off added", "success");
    router.refresh();
  }

  async function removeTimeOff(id: string) {
    const { error: deleteError } = await supabase.from("staff_time_off").delete().eq("id", id);
    if (deleteError) {
      toast.show(deleteError.message, "error");
      return;
    }
    toast.show("Removed", "success");
    router.refresh();
  }

  const sorted = [...timeOff].sort((a, b) => a.start_date.localeCompare(b.start_date));

  return (
    <div className="space-y-4">
      <form onSubmit={addTimeOff} className="rounded-2xl border border-border bg-surface p-4 shadow-soft">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {canManageOthers && (
            <label className="flex flex-col gap-1 text-xs font-medium text-muted sm:col-span-2">
              For
              <select value={forUserId} onChange={(e) => setForUserId(e.target.value)} className={inputClass}>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.id === currentUserId ? `${s.label} (you)` : s.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            Start date
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputClass} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            End date
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={inputClass} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted sm:col-span-2">
            Reason (optional, only your team sees this)
            <input placeholder="Vacation, out sick, etc." value={reason} onChange={(e) => setReason(e.target.value)} className={inputClass} />
          </label>
        </div>
        {error && <p className="mt-2 text-sm text-danger">{error}</p>}
        <button
          type="submit"
          disabled={saving}
          className="mt-3 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-60"
        >
          {saving ? "Adding..." : "Add time off"}
        </button>
      </form>

      <div className="rounded-2xl border border-border bg-surface shadow-soft">
        {sorted.length === 0 ? (
          <p className="p-4 text-sm text-muted">No time off scheduled.</p>
        ) : (
          <ul className="divide-y divide-border">
            {sorted.map((t) => {
              const canRemove = canManageOthers || t.user_id === currentUserId;
              return (
                <li key={t.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                  <div>
                    <p className="font-medium text-ink">
                      {staffLabel.get(t.user_id) ?? "Staff member"}
                      {t.user_id === currentUserId ? " (you)" : ""}
                    </p>
                    <p className="text-xs text-muted">
                      {t.start_date === t.end_date ? t.start_date : `${t.start_date} - ${t.end_date}`}
                      {t.reason ? ` -- ${t.reason}` : ""}
                    </p>
                  </div>
                  {canRemove && (
                    <button
                      type="button"
                      onClick={() => removeTimeOff(t.id)}
                      className="shrink-0 rounded-lg p-2 text-muted hover:text-danger"
                      aria-label="Remove"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
