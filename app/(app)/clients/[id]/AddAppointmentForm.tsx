"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function AddAppointmentForm({
  clientId,
  workspaceId,
  onCreated,
}: {
  clientId: string;
  workspaceId: string;
  /** Fires after a successful save, before the router refresh. */
  onCreated?: () => void;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [startAt, setStartAt] = useState("");
  const [location, setLocation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!title.trim() || !startAt) {
      setError("Title and start time are required.");
      return;
    }
    setSaving(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    const startDate = new Date(startAt);
    const { error: insertError } = await supabase.from("appointments").insert({
      workspace_id: workspaceId,
      client_id: clientId,
      title: title.trim(),
      start_at: startDate.toISOString(),
      end_at: new Date(startDate.getTime() + 60 * 60 * 1000).toISOString(),
      location: location.trim() || null,
      created_by: user?.id,
    });
    setSaving(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setTitle("");
    setStartAt("");
    setLocation("");
    setOpen(false);
    onCreated?.();
    router.refresh();
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-xs font-medium text-accent hover:underline">
        + Schedule
      </button>
    );
  }

  return (
    <form onSubmit={create} className="mt-2 flex flex-wrap items-end gap-2 rounded-lg border border-border bg-surfaceMuted p-3">
      <label className="flex flex-col gap-1 text-xs text-muted">
        Title
        <input
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="rounded-lg border border-border px-2 py-1.5 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Start
        <input
          required
          type="datetime-local"
          value={startAt}
          onChange={(e) => setStartAt(e.target.value)}
          className="rounded-lg border border-border px-2 py-1.5 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Location (optional)
        <input
          value={location}
          onChange={(e) => setLocation(e.target.value)}
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
          {saving ? "Scheduling..." : "Schedule"}
        </button>
      </div>
    </form>
  );
}
