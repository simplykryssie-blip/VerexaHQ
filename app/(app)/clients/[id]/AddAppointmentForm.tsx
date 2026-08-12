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
  const [meetingUrl, setMeetingUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [creatingZoomMeeting, setCreatingZoomMeeting] = useState(false);

  async function createZoomMeeting() {
    if (!title.trim() || !startAt) {
      setError("Add a title and start time first.");
      return;
    }
    setCreatingZoomMeeting(true);
    setError(null);
    try {
      const res = await fetch("/api/zoom/meetings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), startAt: new Date(startAt).toISOString(), durationMinutes: 60 }),
      });
      const data = (await res.json()) as { configured?: boolean; joinUrl?: string; reason?: string; error?: string };
      if (data.configured && data.joinUrl) {
        setMeetingUrl(data.joinUrl);
      } else {
        setError(data.reason ?? data.error ?? "Couldn't create the Zoom meeting.");
      }
    } catch {
      setError("Couldn't create the Zoom meeting.");
    } finally {
      setCreatingZoomMeeting(false);
    }
  }

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
      meeting_url: meetingUrl.trim() || null,
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
    setMeetingUrl("");
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
      <div className="flex flex-col gap-1 text-xs text-muted">
        Meeting link (optional)
        <div className="flex gap-2">
          <input
            type="url"
            placeholder="Paste a link or create a Zoom meeting"
            value={meetingUrl}
            onChange={(e) => setMeetingUrl(e.target.value)}
            className="w-56 rounded-lg border border-border px-2 py-1.5 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <button
            type="button"
            onClick={createZoomMeeting}
            disabled={creatingZoomMeeting}
            className="shrink-0 whitespace-nowrap rounded-lg border border-border px-2 py-1.5 text-xs font-medium text-slate hover:bg-surface disabled:opacity-60"
          >
            {creatingZoomMeeting ? "Creating..." : "Create Zoom meeting"}
          </button>
        </div>
      </div>
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
