"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Client, Deadline } from "@/lib/types";

export default function NewDeadlineModal({
  clientId,
  deadline,
  onClose,
  onSaved,
  onDeleted,
}: {
  clientId?: string;
  deadline?: Deadline;
  onClose: () => void;
  onSaved: () => void;
  onDeleted?: () => void;
}) {
  const isEditing = !!deadline;
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClientId, setSelectedClientId] = useState(deadline?.client_id ?? clientId ?? "");
  const [title, setTitle] = useState(deadline?.deadline_title ?? "");
  const [type, setType] = useState(deadline?.deadline_type ?? "");
  const [dueDate, setDueDate] = useState(deadline?.due_date ?? "");
  const [status, setStatus] = useState(deadline?.deadline_status ?? "Upcoming");
  const [notes, setNotes] = useState(deadline?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (clientId) return;
    supabase
      .from("clients")
      .select("id, first_name, last_name, business_name, client_type")
      .order("first_name")
      .then(({ data }) => setClients((data as Client[]) ?? []));
  }, [clientId]);

  function clientLabel(c: Client) {
    return c.client_type === "business" && c.business_name
      ? c.business_name
      : `${c.first_name} ${c.last_name}`.trim();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedClientId) {
      setError("Choose a client for this deadline.");
      return;
    }
    if (!dueDate) {
      setError("Due date is required.");
      return;
    }
    setSaving(true);
    setError(null);

    if (isEditing) {
      const { error } = await supabase
        .from("deadlines")
        .update({
          deadline_title: title,
          deadline_type: type,
          due_date: dueDate,
          deadline_status: status,
          notes,
        })
        .eq("id", deadline!.id);
      setSaving(false);
      if (error) {
        setError(error.message);
        return;
      }
      onSaved();
      onClose();
      return;
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user.id;
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

    const { error } = await supabase.from("deadlines").insert({
      workspace_id: client.workspace_id,
      client_id: selectedClientId,
      deadline_title: title,
      deadline_type: type,
      due_date: dueDate,
      deadline_status: "Upcoming",
      notes,
      assigned_to: userId,
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
    if (!deadline) return;
    if (!window.confirm(`Delete deadline "${deadline.deadline_title}"? This can't be undone.`)) return;
    setDeleting(true);
    const { error } = await supabase.from("deadlines").delete().eq("id", deadline.id);
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
      <div className="bg-white rounded-sm border border-line w-full max-w-md p-6">
        <h3 className="font-slab text-lg font-bold text-ink mb-4">
          {isEditing ? "Edit Deadline" : "New Deadline"}
        </h3>
        <form onSubmit={handleSubmit} className="space-y-3">
          {!clientId && !isEditing && (
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

          <input
            required
            placeholder="Deadline title (e.g. Q2 941 Deposit)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full border border-line rounded-sm px-3 py-2 text-sm"
          />
          <input
            placeholder="Type (e.g. Payroll Tax, Annual Report, BOI)"
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="w-full border border-line rounded-sm px-3 py-2 text-sm"
          />
          <input
            required
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="w-full border border-line rounded-sm px-3 py-2 text-sm"
          />
          {isEditing && (
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full border border-line rounded-sm px-3 py-2 text-sm"
            >
              <option>Upcoming</option>
              <option>Due Soon</option>
              <option>Past Due</option>
              <option>Completed</option>
            </select>
          )}
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
              {saving ? "Saving…" : isEditing ? "Save Changes" : "Create Deadline"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
