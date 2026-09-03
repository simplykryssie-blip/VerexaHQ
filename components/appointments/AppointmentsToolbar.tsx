"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import { DropdownPanel, useDropdownDismiss } from "@/components/ui/Dropdown";
import { isDateInAnyRange } from "@/lib/businessHours";
import type { ClientOption, EngagementOption, StaffOption } from "./types";

export type AppointmentFilter = "upcoming" | "past" | "all";

// Filter tabs + the "New appointment" toggle and its inline create form.
// Lives at the top of the Calendar page, above the month grid, so the
// controls are visible without scrolling past it -- the filtered list
// itself (AppointmentsList) stays below the grid.
export function AppointmentsToolbar({
  workspaceId,
  clients,
  engagements,
  staff,
  staffTimeOff,
  canManage,
  currentUserId,
  filter,
  onFilterChange,
}: {
  workspaceId: string;
  clients: ClientOption[];
  engagements: EngagementOption[];
  staff: StaffOption[];
  staffTimeOff: { user_id: string; start_date: string; end_date: string }[];
  canManage: boolean;
  currentUserId: string | null;
  filter: AppointmentFilter;
  onFilterChange: (filter: AppointmentFilter) => void;
}) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [meetingUrl, setMeetingUrl] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientQuery, setClientQuery] = useState("");
  const [clientDropdownOpen, setClientDropdownOpen] = useState(false);
  const [engagementId, setEngagementId] = useState("");
  const [staffId, setStaffId] = useState(currentUserId ?? "");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [portalVisible, setPortalVisible] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [creatingZoomMeeting, setCreatingZoomMeeting] = useState(false);
  const clientDropdownRef = useDropdownDismiss<HTMLDivElement>(clientDropdownOpen, () => setClientDropdownOpen(false));

  const filteredEngagements = useMemo(() => (clientId ? engagements.filter((e) => e.client_id === clientId) : engagements), [engagements, clientId]);
  // Warning only, not a hard block -- a firm sometimes needs to schedule
  // around someone's time off deliberately, so this just makes sure whoever
  // is booking sees it before they do.
  const timeOffWarning = useMemo(() => {
    if (!staffId || !startAt) return null;
    const isoDate = startAt.slice(0, 10);
    const conflict = staffTimeOff.some((t) => t.user_id === staffId && isDateInAnyRange(isoDate, [{ start: t.start_date, end: t.end_date }]));
    if (!conflict) return null;
    const name = staff.find((s) => s.id === staffId)?.label ?? "This staff member";
    return `${name} has marked this day as time off.`;
  }, [staffId, startAt, staffTimeOff, staff]);
  const matchingClients = useMemo(() => {
    const q = clientQuery.trim().toLowerCase();
    if (!q) return clients.slice(0, 8);
    return clients.filter((c) => c.label.toLowerCase().includes(q)).slice(0, 8);
  }, [clients, clientQuery]);

  async function createAppointment(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!title.trim() || !startAt || !endAt) {
      setError("Title, start time, and end time are required.");
      return;
    }
    setSaving(true);
    const { error: insertError } = await supabase.from("appointments").insert({
      workspace_id: workspaceId,
      title: title.trim(),
      description: description.trim() || null,
      location: location.trim() || null,
      meeting_url: meetingUrl.trim() || null,
      client_id: clientId || null,
      engagement_id: engagementId || null,
      staff_id: staffId || null,
      start_at: new Date(startAt).toISOString(),
      end_at: new Date(endAt).toISOString(),
      portal_visible: portalVisible,
    });
    setSaving(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    toast.show("Appointment scheduled", "success");
    setCreating(false);
    setTitle("");
    setDescription("");
    setLocation("");
    setMeetingUrl("");
    setClientId("");
    setClientQuery("");
    setEngagementId("");
    setStaffId(currentUserId ?? "");
    setStartAt("");
    setEndAt("");
    setPortalVisible(true);
    router.refresh();
  }

  async function createZoomMeeting() {
    if (!title.trim() || !startAt || !endAt) {
      toast.show("Add a title, start time, and end time first.", "error");
      return;
    }
    setCreatingZoomMeeting(true);
    try {
      const start = new Date(startAt);
      const durationMinutes = Math.max(15, Math.round((new Date(endAt).getTime() - start.getTime()) / 60000));
      const res = await fetch("/api/zoom/meetings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), startAt: start.toISOString(), durationMinutes }),
      });
      const data = (await res.json()) as { configured?: boolean; joinUrl?: string; reason?: string; error?: string };
      if (data.configured && data.joinUrl) {
        setMeetingUrl(data.joinUrl);
        toast.show("Zoom meeting created", "success");
      } else {
        toast.show(data.reason ?? data.error ?? "Couldn't create the Zoom meeting.", "error");
      }
    } catch {
      toast.show("Couldn't create the Zoom meeting.", "error");
    } finally {
      setCreatingZoomMeeting(false);
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-surface shadow-soft p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-lg border border-border bg-surface p-1">
          {(["upcoming", "past", "all"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => onFilterChange(f)}
              className={`rounded-md px-3 py-1 text-xs font-medium capitalize transition ${
                filter === f ? "bg-accentSoft text-accent" : "text-muted hover:text-ink"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
        {canManage && (
          <button
            type="button"
            onClick={() => setCreating((v) => !v)}
            className="flex items-center gap-1.5 text-sm font-medium text-accent hover:underline"
          >
            <CalendarPlus size={16} /> {creating ? "Cancel" : "New appointment"}
          </button>
        )}
      </div>

      {canManage && creating && (
        <form onSubmit={createAppointment} className="mt-3 border-t border-border pt-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input
              required
              placeholder="Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent sm:col-span-2"
            />
            <div ref={clientDropdownRef} className="relative">
              <input
                type="text"
                placeholder="Search clients..."
                value={clientQuery}
                onChange={(e) => {
                  setClientQuery(e.target.value);
                  setClientDropdownOpen(true);
                  if (clientId) {
                    setClientId("");
                    setEngagementId("");
                  }
                }}
                onFocus={() => setClientDropdownOpen(true)}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
              {clientDropdownOpen && matchingClients.length > 0 && (
                <DropdownPanel className="mt-1 w-full">
                  <ul>
                    {matchingClients.map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setClientId(c.id);
                            setClientQuery(c.label);
                            setEngagementId("");
                            setClientDropdownOpen(false);
                          }}
                          className="block w-full px-3 py-2 text-left text-sm text-slate hover:bg-surfaceMuted"
                        >
                          {c.label}
                        </button>
                      </li>
                    ))}
                  </ul>
                </DropdownPanel>
              )}
            </div>
            <select
              value={engagementId}
              onChange={(e) => setEngagementId(e.target.value)}
              className="rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            >
              <option value="">No engagement</option>
              {filteredEngagements.map((eng) => (
                <option key={eng.id} value={eng.id}>
                  {eng.label}
                </option>
              ))}
            </select>
            <select
              value={staffId}
              onChange={(e) => setStaffId(e.target.value)}
              className="rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            >
              <option value="">Unassigned</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
            <input
              placeholder="Location (e.g. Office, Phone)"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
            <div className="flex gap-2 sm:col-span-2">
              <input
                type="url"
                placeholder="Meeting link (paste your Zoom/Google Meet link)"
                value={meetingUrl}
                onChange={(e) => setMeetingUrl(e.target.value)}
                className="flex-1 rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
              <button
                type="button"
                onClick={createZoomMeeting}
                disabled={creatingZoomMeeting}
                className="shrink-0 whitespace-nowrap rounded-lg border border-border px-3 py-2 text-xs font-medium text-slate hover:bg-surfaceMuted disabled:opacity-60"
              >
                {creatingZoomMeeting ? "Creating..." : "Create Zoom meeting"}
              </button>
            </div>
            <label className="flex flex-col gap-1 text-xs font-medium text-muted">
              Start
              <input
                required
                type="datetime-local"
                value={startAt}
                onChange={(e) => setStartAt(e.target.value)}
                className="rounded-lg border border-border px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-muted">
              End
              <input
                required
                type="datetime-local"
                value={endAt}
                onChange={(e) => setEndAt(e.target.value)}
                className="rounded-lg border border-border px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </label>
            <textarea
              placeholder="Notes (optional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent sm:col-span-2"
            />
            <label className="flex items-center gap-2 text-sm text-slate sm:col-span-2">
              <input type="checkbox" checked={portalVisible} onChange={(e) => setPortalVisible(e.target.checked)} className="rounded border-border" />
              Visible to the client in their portal
            </label>
          </div>
          {timeOffWarning && <p className="mt-2 text-sm text-warning">{timeOffWarning}</p>}
          {error && <p className="mt-2 text-sm text-danger">{error}</p>}
          <button
            type="submit"
            disabled={saving}
            className="mt-3 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-60"
          >
            {saving ? "Scheduling..." : "Schedule appointment"}
          </button>
        </form>
      )}
    </div>
  );
}
