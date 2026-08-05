"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import { EmptyState } from "@/components/EmptyState";
import type { AppointmentRow, ClientOption, EngagementOption, StaffOption } from "./types";

const STATUS_LABEL: Record<string, string> = {
  scheduled: "Scheduled",
  confirmed: "Confirmed",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "No-show",
};

const STATUS_STYLE: Record<string, string> = {
  scheduled: "text-accent",
  confirmed: "text-green-700",
  completed: "text-muted",
  cancelled: "text-danger",
  no_show: "text-danger",
};

export function AppointmentsManager({
  workspaceId,
  appointments,
  clients,
  engagements,
  staff,
  canManage,
  currentUserId,
}: {
  workspaceId: string;
  appointments: AppointmentRow[];
  clients: ClientOption[];
  engagements: EngagementOption[];
  staff: StaffOption[];
  canManage: boolean;
  currentUserId: string | null;
}) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState<"upcoming" | "past" | "all">("upcoming");
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

  const filteredEngagements = useMemo(() => (clientId ? engagements.filter((e) => e.client_id === clientId) : engagements), [engagements, clientId]);
  const matchingClients = useMemo(() => {
    const q = clientQuery.trim().toLowerCase();
    if (!q) return clients.slice(0, 8);
    return clients.filter((c) => c.label.toLowerCase().includes(q)).slice(0, 8);
  }, [clients, clientQuery]);

  const visibleAppointments = useMemo(() => {
    const now = Date.now();
    return appointments.filter((a) => {
      if (filter === "upcoming") return new Date(a.start_at).getTime() >= now;
      if (filter === "past") return new Date(a.start_at).getTime() < now;
      return true;
    });
  }, [appointments, filter]);

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

  async function updateStatus(id: string, status: string) {
    const { error: updateError } = await supabase.from("appointments").update({ status }).eq("id", id);
    if (updateError) {
      toast.show(updateError.message, "error");
      return;
    }
    router.refresh();
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this appointment?")) return;
    const { error: deleteError } = await supabase.from("appointments").delete().eq("id", id);
    if (deleteError) {
      toast.show(deleteError.message, "error");
      return;
    }
    toast.show("Appointment deleted", "info");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-lg border border-border bg-surface p-1">
          {(["upcoming", "past", "all"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
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
        <form onSubmit={createAppointment} className="rounded-xl border border-border bg-surface p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input
              required
              placeholder="Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent sm:col-span-2"
            />
            <div className="relative">
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
                onBlur={() => setTimeout(() => setClientDropdownOpen(false), 100)}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
              {clientDropdownOpen && matchingClients.length > 0 && (
                <ul className="absolute z-10 mt-1 w-full rounded-lg border border-border bg-surface shadow-md">
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
            <input
              type="url"
              placeholder="Meeting link (paste your Zoom/Google Meet link)"
              value={meetingUrl}
              onChange={(e) => setMeetingUrl(e.target.value)}
              className="rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent sm:col-span-2"
            />
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

      {visibleAppointments.length === 0 ? (
        <EmptyState message="No appointments." />
      ) : (
        <ul className="space-y-2">
          {visibleAppointments.map((a) => (
            <li key={a.id} className="rounded-xl border border-border bg-surface p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-ink">{a.title}</p>
                  <p className="text-xs text-muted">
                    {new Date(a.start_at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })} --{" "}
                    {new Date(a.end_at).toLocaleTimeString([], { timeStyle: "short" })}
                    {a.location && ` -- ${a.location}`}
                  </p>
                  {(a.client_label || a.engagement_label) && (
                    <p className="mt-1 text-xs text-slate">{a.engagement_label ?? a.client_label}</p>
                  )}
                  {a.staff_name && <p className="text-xs text-muted">Staff: {a.staff_name}</p>}
                  {a.meeting_url && (
                    <a href={a.meeting_url} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-accent hover:underline">
                      Join meeting link
                    </a>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {canManage ? (
                    <select
                      value={a.status}
                      onChange={(e) => updateStatus(a.id, e.target.value)}
                      className={`rounded-lg border border-border bg-surface px-2 py-1 text-xs font-medium capitalize focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent ${STATUS_STYLE[a.status]}`}
                    >
                      {Object.entries(STATUS_LABEL).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className={`text-xs font-medium capitalize ${STATUS_STYLE[a.status]}`}>{STATUS_LABEL[a.status]}</span>
                  )}
                  {canManage && (
                    <button type="button" onClick={() => remove(a.id)} aria-label="Delete appointment" className="text-muted hover:text-danger">
                      <X size={16} />
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
