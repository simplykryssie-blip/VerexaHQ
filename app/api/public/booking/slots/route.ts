import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { checkRateLimit, clientIp } from "@/lib/rateLimit";
import {
  DEFAULT_BUSINESS_HOURS,
  DEFAULT_SLOT_MINUTES,
  slotsForDay,
  filterAvailableSlots,
  isServiceBookableOnDate,
  isDateInAnyRange,
  toIsoDate,
  type BusinessHours,
  type HolidayRange,
} from "@/lib/businessHours";
import { getExternalBusyBlocks } from "@/lib/calendarSync/freebusy";
import { getBookingSettings } from "@/lib/bookingSettings";

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

  const date = new Date(`${dateParam}T00:00:00`);
  if (Number.isNaN(date.getTime())) return NextResponse.json({ error: "Invalid date." }, { status: 400 });

  const supabase = createServiceClient();

  const { data: workspace } = await supabase.from("workspaces").select("id").eq("slug", workspaceSlug).maybeSingle();
  if (!workspace) return NextResponse.json({ error: "This booking page isn't available." }, { status: 404 });

  const { data: service } = await supabase
    .from("services")
    .select("id, is_bookable, is_portal_visible, workspace_id, estimated_duration_minutes, season_start, season_end, allowed_weekdays")
    .eq("id", serviceId)
    .maybeSingle();
  if (!service || service.workspace_id !== workspace.id || !service.is_bookable || !service.is_portal_visible) {
    return NextResponse.json({ error: "This service isn't bookable." }, { status: 404 });
  }
  if (!isServiceBookableOnDate(date, { seasonStart: service.season_start, seasonEnd: service.season_end, allowedWeekdays: service.allowed_weekdays })) {
    return NextResponse.json({ slots: [], durationMinutes: service.estimated_duration_minutes ?? DEFAULT_SLOT_MINUTES });
  }

  const { windowDays, minNoticeHours, bufferMinutes } = await getBookingSettings(supabase, workspace.id);
  const windowEnd = new Date();
  windowEnd.setDate(windowEnd.getDate() + windowDays);
  if (date > windowEnd) {
    return NextResponse.json({ slots: [], durationMinutes: service.estimated_duration_minutes ?? DEFAULT_SLOT_MINUTES });
  }

  if (staffId) {
    const { data: timeOff } = await supabase
      .from("staff_time_off")
      .select("start_date, end_date")
      .eq("workspace_id", workspace.id)
      .eq("user_id", staffId);
    if (isDateInAnyRange(toIsoDate(date), (timeOff ?? []).map((t) => ({ start: t.start_date, end: t.end_date })))) {
      return NextResponse.json({ slots: [], durationMinutes: service.estimated_duration_minutes ?? DEFAULT_SLOT_MINUTES });
    }
  }

  const { data: hoursSetting } = await supabase
    .from("system_settings")
    .select("value")
    .eq("workspace_id", workspace.id)
    .eq("key", "business_hours")
    .maybeSingle();
  const { data: slotSetting } = await supabase
    .from("system_settings")
    .select("value")
    .eq("workspace_id", workspace.id)
    .eq("key", "booking_slot_minutes")
    .maybeSingle();
  const { data: holidaysSetting } = await supabase
    .from("system_settings")
    .select("value")
    .eq("workspace_id", workspace.id)
    .eq("key", "holidays")
    .maybeSingle();

  const businessHours = (hoursSetting?.value as BusinessHours | undefined) ?? DEFAULT_BUSINESS_HOURS;
  const gridMinutes = (slotSetting?.value as number | undefined) ?? DEFAULT_SLOT_MINUTES;
  const holidays = (holidaysSetting?.value as HolidayRange[] | undefined) ?? [];
  const durationMinutes = service.estimated_duration_minutes ?? gridMinutes;

  const dayStart = new Date(date);
  const dayEnd = new Date(date);
  dayEnd.setDate(dayEnd.getDate() + 1);

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

  const earliestStart = new Date(Date.now() + minNoticeHours * 3600000);
  const candidates = slotsForDay(date, businessHours, gridMinutes, durationMinutes, holidays);
  const available = filterAvailableSlots(candidates, durationMinutes, [...(existing ?? []), ...externalBusy], earliestStart, bufferMinutes);

  return NextResponse.json({ slots: available.map((s) => s.toISOString()), durationMinutes });
}
