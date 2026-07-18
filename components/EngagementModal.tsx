"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Client, BookkeepingEngagement } from "@/lib/types";

const STATUSES = ["active", "paused", "cleanup", "offboarding", "closed"];
const FREQUENCIES = ["weekly", "monthly", "quarterly"];

export default function EngagementModal({
  engagement,
  onClose,
  onSaved,
  onDeleted,
}: {
  engagement?: BookkeepingEngagement;
  onClose: () => void;
  onSaved: () => void;
  onDeleted?: () => void;
}) {
  const isEditing = !!engagement;
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClientId, setSelectedClientId] = useState(engagement?.client_id ?? "");
  const [status, setStatus] = useState(engagement?.engagement_status ?? "active");
  const [frequency, setFrequency] = useState(engagement?.frequency ?? "monthly");
  const [software, setSoftware] = useState(engagement?.bookkeeping_software ?? "");
  const [monthlyFee, setMonthlyFee] = useState(engagement?.monthly_fee?.toString() ?? "");
  const [cleanupNeeded, setCleanupNeeded] = useState(engagement?.cleanup_needed ?? false);
  const [notes, setNotes] = useState(engagement?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isEditing) return;
    supabase
      .from("clients")
      .select("id, first_name, last_name, business_name, client_type")
      .order("first_name")
      .then(({ data }) => setClients((data as Client[]) ?? []));
  }, [isEditing]);

  function clientLabel(c: Client) {
    return c.client_type === "business" && c.business_name
      ? c.business_name
      : `${c.first_name} ${c.last_name}`.trim();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isEditing && !selectedClientId) {
      setError("Choose a client for this engagement.");
      return;
    }
    setSaving(true);
    setError(null);

    const payload = {
      engagement_status: status,
      frequency,
      bookkeeping_software: software,
      monthly_fee: monthlyFee ? parseFloat(monthlyFee) : null,
      cleanup_needed: cleanupNeeded,
      notes,
    };

    if (isEditing) {
      const { error } = await supabase
        .from("bookkeeping_engagements")
        .update(payload)
        .eq("id", engagement!.id);
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
      .eq("id", selectedClientId)
      .maybeSingle();

    if (!client) {
      setError("Could not find that client's workspace.");
      setSaving(false);
      return;
    }

    const { error } = await supabase.from("bookkeeping_engagements").insert({
      workspace_id: client.workspace_id,
      client_id: selectedClientId,
      start_date: new Date().toISOString().slice(0, 10),
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
    if (!engagement) return;
    if (
      !window.confirm(
        "Delete this bookkeeping engagement? Accounts, periods, and transactions under it will remain but become orphaned — clean those up first for a tidy delete."
      )
    )
      return;
    setDeleting(true);
    const { error } = await supabase
      .from("bookkeeping_engagements")
      .delete()
      .eq("id", engagement.id);
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
      <div className="bg-white rounded-sm border border-line w-full max-w-md p-6 max-h-[85vh] overflow-y-auto">
        <h3 className="font-slab text-lg font-bold text-ink mb-4">
          {isEditing ? "Edit Engagement" : "New Bookkeeping Engagement"}
        </h3>
        <form onSubmit={handleSubmit} className="space-y-3">
          {!isEditing && (
            <select
              required
              value={selectedClientId}
              onChange={(e) => setSelectedClientId(e.target.value)}
              className="w-full border border-line rounded-sm px-3 py-2 text-sm"
            >
              <option value="">Select client…</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {clientLabel(c)}
                </option>
              ))}
            </select>
          )}

          <div className="flex gap-2">
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-1/2 border border-line rounded-sm px-3 py-2 text-sm"
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <select
              value={frequency}
              onChange={(e) => setFrequency(e.target.value)}
              className="w-1/2 border border-line rounded-sm px-3 py-2 text-sm"
            >
              {FREQUENCIES.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>

          <input
            placeholder="Bookkeeping software (e.g. QuickBooks Online)"
            value={software}
            onChange={(e) => setSoftware(e.target.value)}
            className="w-full border border-line rounded-sm px-3 py-2 text-sm"
          />
          <input
            type="number"
            step="0.01"
            placeholder="Monthly fee"
            value={monthlyFee}
            onChange={(e) => setMonthlyFee(e.target.value)}
            className="w-full border border-line rounded-sm px-3 py-2 text-sm"
          />

          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={cleanupNeeded}
              onChange={(e) => setCleanupNeeded(e.target.checked)}
              className="accent-[#0D1B2A]"
            />
            Needs catch-up / cleanup work
          </label>

          <textarea
            placeholder="Notes (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
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
              {saving ? "Saving…" : isEditing ? "Save Changes" : "Create Engagement"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
