import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { checkRateLimit, clientIp } from "@/lib/rateLimit";
import { DEFAULT_SLOT_MINUTES, slotsForDay, filterAvailableSlots, isServiceBookableOnDate, isDateInAnyRange } from "@/lib/businessHours";
import { getExternalBusyBlocks } from "@/lib/calendarSync/freebusy";
import { resolveEffectiveAvailability } from "@/lib/bookingAvailability";
import { zonedTimeToUtc } from "@/lib/timezone";

// Public, unauthenticated equivalent of /api/portal/available-slots --
// resolves the workspace from its public slug instead of a portal session.
// When a staffId is given (a personal booking link, e.g. "book time with
// Monica"), availability is scoped to that one person: their own time off
// and their own existing appointments, not the whole firm's. Without one
// (the general/open link), it's workspace-wide, same as the portal flow.
export async function GET(request: Request) {
  const allowed = await checkRateLimit(`public-booking-slots:${clientIp(request)}`, 120, 60);
  if (!allowed) return NextResponse.json({ error: "Too many requests. Try again shortly." }, { status: 429 });

  const { searchParams } = new URL(request.url);
  const workspaceSlug = searchParams.get("workspaceSlug");
  const serviceId = searchParams.get("serviceId");
  const dateParam = searchParams.get("date");
  const staffId = searchParams.get("staffId") || null;
  if (!workspaceSlug || !serviceId || !dateParam) {
    return NextResponse.json({ error: "workspaceSlug, serviceId and date are required." }, { status: 400 });
  }

  // Weekday/season checks only ever care about the calendar date itself,
  // never a real instant -- parsed as UTC so the server's own timezone can
  // never shift which calendar day this resolves to.
  const dateAsUtc = new Date(`${dateParam}T00:00:00Z`);
  if (Number.isNaN(dateAsUtc.getTime())) return NextResponse.json({ error: "Invalid date." }, { status: 400 });

  const supabase = createServiceClient();

  const { data: workspace } = await supabase.from("workspaces").select("id").eq("slug", workspaceSlug).maybeSingle();
  if (!workspace) return NextResponse.json({ error: "This booking page isn't available." }, { status: 404 });

  const { data: service } = await supabase
    .from("services")
    .select(
      "id, is_bookable, is_portal_visible, workspace_id, estimated_duration_minutes, season_start, season_end, allowed_weekdays, allow_overlapping_bookings, booking_min_notice_hours_override, booking_buffer_minutes_override, booking_window_days_override, booking_location_id"
    )
    .eq("id", serviceId)
    .maybeSingle();
  if (!service || service.workspace_id !== workspace.id || !service.is_bookable || !service.is_portal_visible) {
    return NextResponse.json({ error: "This service isn't bookable." }, { status: 404 });
  }
  if (!isServiceBookableOnDate(dateAsUtc, { seasonStart: service.season_start, seasonEnd: service.season_end, allowedWeekdays: service.allowed_weekdays })) {
    return NextResponse.json({ slots: [], durationMinutes: service.estimated_duration_minutes ?? DEFAULT_SLOT_MINUTES });
  }

  const { hours, timeZone, gridMinutes, holidays, minNoticeHours, bufferMinutes, windowDays } = await resolveEffectiveAvailability(
    supabase,
    workspace.id,
    staffId,
    service
  );
  const windowEnd = new Date();
  windowEnd.setDate(windowEnd.getDate() + windowDays);
  if (dateAsUtc > windowEnd) {
    return NextResponse.json({ slots: [], durationMinutes: service.estimated_duration_minutes ?? DEFAULT_SLOT_MINUTES });
  }

  if (staffId) {
    const { data: timeOff } = await supabase
      .from("staff_time_off")
      .select("start_date, end_date")
      .eq("workspace_id", workspace.id)
      .eq("user_id", staffId);
    if (isDateInAnyRange(dateParam, (timeOff ?? []).map((t) => ({ start: t.start_date, end: t.end_date })))) {
      return NextResponse.json({ slots: [], durationMinutes: service.estimated_duration_minutes ?? DEFAULT_SLOT_MINUTES });
    }
  }

  const durationMinutes = service.estimated_duration_minutes ?? gridMinutes;

  // Real day boundaries in the effective timezone, not the server's own
  // clock -- otherwise "today's appointments" could include or miss ones
  // near midnight depending on where the server happens to run.
  const dayStart = zonedTimeToUtc(dateParam, "00:00", timeZone);
  const dayEnd = zonedTimeToUtc(dateParam, "00:00", timeZone);
  dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

  let existingQuery = supabase
    .from("appointments")
    .select("start_at, end_at")
    .eq("workspace_id", workspace.id)
    .neq("status", "cancelled")
    .gte("start_at", dayStart.toISOString())
    .lt("start_at", dayEnd.toISOString());
  if (staffId) existingQuery = existingQuery.eq("staff_id", staffId);
  const { data: existing } = await existingQuery;

  // Best effort -- a connected personal calendar's busy blocks, for the one
  // staff member this link is scoped to, or every connected staff member
  // when it isn't scoped to anyone in particular.
  const externalBusy = await getExternalBusyBlocks(supabase, workspace.id, dayStart.toISOString(), dayEnd.toISOString());

  // A service marked "allow overlapping bookings" tolerates sharing a slot
  // with another Verexa appointment -- skip filtering those out (a
  // connected personal calendar's busy blocks still apply either way,
  // since that's a real external conflict, not an internal double-booking
  // tolerance).
  const busyBlocks = service.allow_overlapping_bookings ? externalBusy : [...(existing ?? []), ...externalBusy];

  const earliestStart = new Date(Date.now() + minNoticeHours * 3600000);
  const candidates = slotsForDay(dateParam, timeZone, hours, gridMinutes, durationMinutes, holidays);
  const available = filterAvailableSlots(candidates, durationMinutes, busyBlocks, earliestStart, bufferMinutes);

  return NextResponse.json({ slots: available.map((s) => s.toISOString()), durationMinutes });
}
