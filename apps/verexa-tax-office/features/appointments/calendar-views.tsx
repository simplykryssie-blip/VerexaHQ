"use client";

import Link from "next/link";
import { useMemo } from "react";
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  format,
} from "date-fns";
import { Badge } from "@/components/ui/badge";
import { appointmentStatusLabel, appointmentLocationLabel } from "@/lib/validation/appointments";
import { cn } from "@/lib/utils";
import type { Tables } from "@/types/database";

type AppointmentRow = Tables<"appointments"> & {
  client?: { first_name?: string | null; last_name?: string | null; company?: string | null } | null;
  lead?: { first_name?: string | null; last_name?: string | null } | null;
  appointment_type?: { name?: string | null; color?: string | null } | null;
  zoom_meeting?: { join_url?: string | null; status?: string | null } | null;
};

function appointmentSubject(a: AppointmentRow): string {
  if (a.client) return a.client.company || `${a.client.first_name ?? ""} ${a.client.last_name ?? ""}`.trim();
  if (a.lead) return `${a.lead.first_name ?? ""} ${a.lead.last_name ?? ""}`.trim();
  return "";
}

function AppointmentChip({ appointment }: { appointment: AppointmentRow }) {
  return (
    <Link
      href={`/calendar/${appointment.id}`}
      className="block truncate rounded px-1.5 py-0.5 text-[10px] hover:opacity-80"
      style={{ backgroundColor: appointment.appointment_type?.color ?? "hsl(var(--secondary))" }}
    >
      {format(new Date(appointment.starts_at), "h:mma")} {appointment.title}
    </Link>
  );
}

export function MonthView({ appointments, month }: { appointments: AppointmentRow[]; month: Date }) {
  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(month));
    const end = endOfWeek(endOfMonth(month));
    return eachDayOfInterval({ start, end });
  }, [month]);

  const byDay = useMemo(() => {
    const map = new Map<string, AppointmentRow[]>();
    for (const a of appointments) {
      const key = format(new Date(a.starts_at), "yyyy-MM-dd");
      map.set(key, [...(map.get(key) ?? []), a]);
    }
    return map;
  }, [appointments]);

  return (
    <div className="grid grid-cols-7 gap-1 text-xs">
      {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
        <div key={d} className="text-center font-medium text-muted-foreground py-1">
          {d}
        </div>
      ))}
      {days.map((day) => {
        const key = format(day, "yyyy-MM-dd");
        const items = byDay.get(key) ?? [];
        return (
          <div
            key={key}
            className={cn("min-h-24 rounded-md border border-border p-1 space-y-1 overflow-hidden", !isSameMonth(day, month) && "opacity-40", isSameDay(day, new Date()) && "border-brand")}
          >
            <div className="text-[10px] text-muted-foreground">{format(day, "d")}</div>
            {items.slice(0, 3).map((a) => (
              <AppointmentChip key={a.id} appointment={a} />
            ))}
            {items.length > 3 && <div className="text-[10px] text-muted-foreground">+{items.length - 3} more</div>}
          </div>
        );
      })}
    </div>
  );
}

export function WeekView({ appointments, week }: { appointments: AppointmentRow[]; week: Date }) {
  const days = useMemo(() => eachDayOfInterval({ start: startOfWeek(week), end: endOfWeek(week) }), [week]);
  return (
    <div className="grid grid-cols-1 sm:grid-cols-7 gap-2">
      {days.map((day) => {
        const items = appointments
          .filter((a) => isSameDay(new Date(a.starts_at), day))
          .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
        return (
          <div key={day.toISOString()} className={cn("rounded-md border border-border p-2 min-h-32", isSameDay(day, new Date()) && "border-brand")}>
            <div className="text-xs font-medium mb-2">{format(day, "EEE d")}</div>
            <div className="space-y-1">
              {items.length === 0 ? (
                <p className="text-[10px] text-muted-foreground">—</p>
              ) : (
                items.map((a) => <AgendaCard key={a.id} appointment={a} compact />)
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function DayView({ appointments, day }: { appointments: AppointmentRow[]; day: Date }) {
  const items = appointments
    .filter((a) => isSameDay(new Date(a.starts_at), day))
    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{format(day, "EEEE, MMMM d, yyyy")}</p>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">No appointments scheduled.</p>
      ) : (
        items.map((a) => <AgendaCard key={a.id} appointment={a} />)
      )}
    </div>
  );
}

export function AgendaView({ appointments }: { appointments: AppointmentRow[] }) {
  const byDay = useMemo(() => {
    const map = new Map<string, AppointmentRow[]>();
    for (const a of appointments) {
      const key = format(new Date(a.starts_at), "yyyy-MM-dd");
      map.set(key, [...(map.get(key) ?? []), a]);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [appointments]);

  if (byDay.length === 0) return <p className="text-sm text-muted-foreground py-8 text-center">No upcoming appointments in this range.</p>;

  return (
    <div className="space-y-4">
      {byDay.map(([key, items]) => (
        <div key={key}>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">{format(new Date(key), "EEEE, MMMM d")}</p>
          <div className="space-y-2">
            {items
              .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())
              .map((a) => (
                <AgendaCard key={a.id} appointment={a} />
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function AgendaCard({ appointment, compact = false }: { appointment: AppointmentRow; compact?: boolean }) {
  const subject = appointmentSubject(appointment);
  return (
    <Link href={`/calendar/${appointment.id}`} className="block rounded-lg border border-border bg-card p-2.5 hover:shadow-sm transition-shadow">
      <div className="flex items-center justify-between gap-2">
        <span className={cn("font-medium", compact ? "text-xs" : "text-sm")}>{appointment.title}</span>
        <Badge variant="secondary" className={compact ? "text-[9px] px-1.5" : ""}>
          {appointmentStatusLabel(appointment.status)}
        </Badge>
      </div>
      {!compact && subject && <p className="text-xs text-muted-foreground mt-0.5">{subject}</p>}
      <p className="text-[10px] text-muted-foreground mt-1">
        {format(new Date(appointment.starts_at), "h:mm a")}–{format(new Date(appointment.ends_at), "h:mm a")} · {appointmentLocationLabel(appointment.location_type)}
      </p>
    </Link>
  );
}
