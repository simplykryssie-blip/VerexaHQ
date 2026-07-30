import Link from "next/link";
import { startOfMonth, endOfMonth, startOfWeek, endOfWeek, addMonths, subMonths, addWeeks, subWeeks, addDays, subDays, format } from "date-fns";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { getAppointments, getAppointmentTypes } from "@/features/appointments/queries";
import { MonthView, WeekView, DayView, AgendaView } from "@/features/appointments/calendar-views";
import { AppointmentFormDialog } from "@/features/appointments/appointment-form-dialog";
import type { PickerOption } from "@/features/engagements/client-picker";

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ view?: string; date?: string }> }) {
  const { view = "month", date } = await searchParams;
  const anchor = date ? new Date(date) : new Date();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: membership } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user!.id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  const workspaceId = membership!.workspace_id;

  let from: Date, to: Date;
  if (view === "week") {
    from = startOfWeek(anchor);
    to = endOfWeek(anchor);
  } else if (view === "day") {
    from = anchor;
    to = anchor;
  } else if (view === "agenda") {
    from = anchor;
    to = addDays(anchor, 30);
  } else {
    from = startOfWeek(startOfMonth(anchor));
    to = endOfWeek(endOfMonth(anchor));
  }

  const [appointments, appointmentTypes, { data: clients }, { data: leads }, { data: staffMembers }] = await Promise.all([
    getAppointments(workspaceId, { from: from.toISOString(), to: to.toISOString() }),
    getAppointmentTypes(workspaceId),
    supabase.from("clients").select("id, first_name, last_name, company").eq("workspace_id", workspaceId).is("archived_at", null),
    supabase.from("leads").select("id, first_name, last_name").eq("workspace_id", workspaceId),
    supabase
      .from("workspace_members")
      .select("user_id, profile:user_profiles(display_name, first_name, last_name)")
      .eq("workspace_id", workspaceId)
      .eq("status", "active"),
  ]);

  const clientOptions: PickerOption[] = (clients ?? []).map((c) => ({ id: c.id, label: c.company || `${c.first_name} ${c.last_name}` }));
  const leadOptions: PickerOption[] = (leads ?? []).map((l) => ({ id: l.id, label: `${l.first_name} ${l.last_name}` }));
  const staffOptions: PickerOption[] = (staffMembers ?? []).map((s) => {
    const profile = s.profile as { display_name?: string | null; first_name?: string | null; last_name?: string | null } | null;
    return { id: s.user_id, label: profile?.display_name || [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || "Team member" };
  });

  function navHref(nextView: string, nextDate?: Date) {
    const d = nextDate ?? anchor;
    return `/calendar?view=${nextView}&date=${format(d, "yyyy-MM-dd")}`;
  }

  let prevDate: Date, nextDate: Date, label: string;
  if (view === "week") {
    prevDate = subWeeks(anchor, 1);
    nextDate = addWeeks(anchor, 1);
    label = `${format(from, "MMM d")} – ${format(to, "MMM d, yyyy")}`;
  } else if (view === "day") {
    prevDate = subDays(anchor, 1);
    nextDate = addDays(anchor, 1);
    label = format(anchor, "EEEE, MMMM d, yyyy");
  } else if (view === "agenda") {
    prevDate = subDays(anchor, 30);
    nextDate = addDays(anchor, 30);
    label = `Next 30 days from ${format(anchor, "MMM d")}`;
  } else {
    prevDate = subMonths(anchor, 1);
    nextDate = addMonths(anchor, 1);
    label = format(anchor, "MMMM yyyy");
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Calendar</h1>
          <p className="text-sm text-muted-foreground mt-1">Appointments across your workspace.</p>
        </div>
        <AppointmentFormDialog workspaceId={workspaceId} clients={clientOptions} leads={leadOptions} staff={staffOptions} appointmentTypes={appointmentTypes} defaultStart={anchor} />
      </div>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Button asChild variant={view === "month" ? "secondary" : "ghost"} size="sm">
            <Link href={navHref("month")}>Month</Link>
          </Button>
          <Button asChild variant={view === "week" ? "secondary" : "ghost"} size="sm">
            <Link href={navHref("week")}>Week</Link>
          </Button>
          <Button asChild variant={view === "day" ? "secondary" : "ghost"} size="sm">
            <Link href={navHref("day")}>Day</Link>
          </Button>
          <Button asChild variant={view === "agenda" ? "secondary" : "ghost"} size="sm">
            <Link href={navHref("agenda")}>Agenda</Link>
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={navHref(view, prevDate)}>← Prev</Link>
          </Button>
          <span className="text-sm font-medium min-w-[160px] text-center">{label}</span>
          <Button asChild variant="outline" size="sm">
            <Link href={navHref(view, nextDate)}>Next →</Link>
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        {view === "week" ? (
          <WeekView appointments={appointments} week={anchor} />
        ) : view === "day" ? (
          <DayView appointments={appointments} day={anchor} />
        ) : view === "agenda" ? (
          <AgendaView appointments={appointments} />
        ) : (
          <MonthView appointments={appointments} month={anchor} />
        )}
      </div>
    </div>
  );
}
