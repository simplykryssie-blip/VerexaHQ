"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarX, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import { EmptyState } from "@/components/EmptyState";
import { renderEmail } from "@/lib/email/template";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import type { AppointmentRow } from "./types";
import type { AppointmentFilter } from "./AppointmentsToolbar";

const STATUS_LABEL: Record<string, string> = {
  scheduled: "Scheduled",
  confirmed: "Confirmed",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "No-show",
};

// Colors the editable <select> itself (the control needs to keep native
// select styling, so it isn't a Badge candidate) -- kept separate from the
// read-only display tone below.
const STATUS_STYLE: Record<string, string> = {
  scheduled: "text-accent",
  confirmed: "text-green-700",
  completed: "text-muted",
  cancelled: "text-danger",
  no_show: "text-danger",
};

const STATUS_TONE: Record<string, BadgeTone> = {
  scheduled: "accent",
  confirmed: "success",
  completed: "neutral",
  cancelled: "danger",
  no_show: "danger",
};

export function AppointmentsList({
  appointments,
  filter,
  canManage,
}: {
  appointments: AppointmentRow[];
  filter: AppointmentFilter;
  canManage: boolean;
}) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [sendingInviteId, setSendingInviteId] = useState<string | null>(null);

  const visibleAppointments = useMemo(() => {
    const now = Date.now();
    return appointments.filter((a) => {
      if (filter === "upcoming") return new Date(a.start_at).getTime() >= now;
      if (filter === "past") return new Date(a.start_at).getTime() < now;
      return true;
    });
  }, [appointments, filter]);

  async function sendInvite(a: AppointmentRow) {
    if (!a.client_email || !a.meeting_url) return;
    setSendingInviteId(a.id);
    try {
      const res = await fetch("/api/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: a.client_email,
          sender: "notifications",
          subject: `Meeting invite: ${a.title}`,
          html: renderEmail({
            heading: "You're invited to a meeting",
            bodyHtml: `<p><strong>${a.title}</strong></p><p>${new Date(a.start_at).toLocaleString([], {
              dateStyle: "medium",
              timeStyle: "short",
            })}</p>`,
            ctaLabel: "Join meeting",
            ctaUrl: a.meeting_url,
          }),
        }),
      });
      if (!res.ok) throw new Error();
      toast.show("Invite sent", "success");
    } catch {
      toast.show("Couldn't send the invite.", "error");
    } finally {
      setSendingInviteId(null);
    }
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

  if (visibleAppointments.length === 0) {
    return (
      <EmptyState
        icon={CalendarX}
        message={
          filter === "upcoming"
            ? "Nothing scheduled -- new appointments will show up here."
            : filter === "past"
              ? "No past appointments."
              : "No appointments yet."
        }
      />
    );
  }

  return (
    <ul className="space-y-2">
      {visibleAppointments.map((a) => (
        <li key={a.id} className="rounded-2xl border border-border bg-surface shadow-soft p-4">
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
                <div className="flex items-center gap-3">
                  <a href={a.meeting_url} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-accent hover:underline">
                    Join meeting link
                  </a>
                  {canManage && a.client_email && (
                    <button
                      type="button"
                      onClick={() => sendInvite(a)}
                      disabled={sendingInviteId === a.id}
                      className="text-xs font-medium text-accent hover:underline disabled:opacity-60"
                    >
                      {sendingInviteId === a.id ? "Sending..." : "Send invite to client"}
                    </button>
                  )}
                </div>
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
                <Badge tone={STATUS_TONE[a.status] ?? "neutral"}>{STATUS_LABEL[a.status]}</Badge>
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
  );
}
