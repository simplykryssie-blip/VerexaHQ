import { NextResponse } from "next/server";
import { getPortalIdentity } from "@/lib/portal";
import { createServiceClient } from "@/lib/supabase/service";
import { slotsForDay, filterAvailableSlots, isServiceBookableOnDate } from "@/lib/businessHours";
import { getExternalBusyBlocks } from "@/lib/calendarSync/freebusy";
import { resolveEffectiveAvailability } from "@/lib/bookingAvailability";
import { zonedTimeToUtc, isoDateInZone } from "@/lib/timezone";
import { resolveBookedMeeting } from "@/lib/zoom/bookingMeeting";

// Mirrors the availability check in available-slots/route.ts and re-runs it
// server-side rather than trusting the slot the client posted back --
// defense against a stale slot list or a client sending an arbitrary time.
export async function POST(request: Request) {
  const identity = await getPortalIdentity();
  if (!identity) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = await request.json().catch(() => null);
  const serviceId = body?.serviceId as string | undefined;
  const startAt = body?.startAt as string | undefined;
  if (!serviceId || !startAt) return NextResponse.json({ error: "serviceId and startAt are required." }, { status: 400 });

  const start = new Date(startAt);
  if (Number.isNaN(start.getTime())) return NextResponse.json({ error: "Invalid start time." }, { status: 400 });

  const supabase = createServiceClient();

  const { data: service } = await supabase
    .from("services")
    .select(
      "id, name, is_bookable, workspace_id, estimated_duration_minutes, season_start, season_end, allowed_weekdays, booking_location_type, booking_meeting_url, zoom_host_user_id, allow_overlapping_bookings, booking_min_notice_hours_override, booking_buffer_minutes_override, booking_window_days_override, booking_location_id"
    )
    .eq("id", serviceId)
    .maybeSingle();
  if (!service || service.workspace_id !== identity.workspaceId || !service.is_bookable) {
    return NextResponse.json({ error: "This service isn't bookable." }, { status: 404 });
  }
  if (!isServiceBookableOnDate(start, { seasonStart: service.season_start, seasonEnd: service.season_end, allowedWeekdays: service.allowed_weekdays })) {
    return NextResponse.json({ error: "This service isn't bookable on that date." }, { status: 409 });
  }

  const { hours, timeZone, gridMinutes, holidays, minNoticeHours, bufferMinutes } = await resolveEffectiveAvailability(
    supabase,
    identity.workspaceId,
    null,
    service
  );
  const durationMinutes = service.estimated_duration_minutes ?? gridMinutes;

  const isoDate = isoDateInZone(start, timeZone);
  const dayStart = zonedTimeToUtc(isoDate, "00:00", timeZone);
  const dayEnd = zonedTimeToUtc(isoDate, "00:00", timeZone);
  dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

  const { data: existing } = await supabase
    .from("appointments")
    .select("start_at, end_at")
    .eq("workspace_id", identity.workspaceId)
    .neq("status", "cancelled")
    .gte("start_at", dayStart.toISOString())
    .lt("start_at", dayEnd.toISOString());

  const externalBusy = await getExternalBusyBlocks(supabase, identity.workspaceId, dayStart.toISOString(), dayEnd.toISOString());

  const busyBlocks = service.allow_overlapping_bookings ? externalBusy : [...(existing ?? []), ...externalBusy];
  const earliestStart = new Date(Date.now() + minNoticeHours * 3600000);
  const candidates = slotsForDay(isoDate, timeZone, hours, gridMinutes, durationMinutes, holidays);
  const available = filterAvailableSlots(candidates, durationMinutes, busyBlocks, earliestStart, bufferMinutes);
  const stillAvailable = available.some((s) => s.getTime() === start.getTime());
  if (!stillAvailable) {
    return NextResponse.json({ error: "That time is no longer available. Pick another slot." }, { status: 409 });
  }

  const end = new Date(start.getTime() + durationMinutes * 60000);
  const { location, meetingUrl } = await resolveBookedMeeting(supabase, {
    locationType: service.booking_location_type,
    staticMeetingUrl: service.booking_meeting_url,
    staffId: null,
    zoomHostUserId: service.zoom_host_user_id,
    topic: service.name,
    startTimeIso: start.toISOString(),
    durationMinutes,
  });

  const { data: appointment, error } = await supabase
    .from("appointments")
    .insert({
      workspace_id: identity.workspaceId,
      client_id: identity.clientId,
      staff_id: null,
      service_id: service.id,
      title: `${service.name} (client-booked)`,
      description: null,
      location,
      meeting_url: meetingUrl,
      start_at: start.toISOString(),
      end_at: end.toISOString(),
      status: "scheduled",
      portal_visible: true,
    })
    .select("id, title, start_at, end_at")
    .single();

  if (error || !appointment) {
    return NextResponse.json({ error: error?.message ?? "Could not book the appointment." }, { status: 500 });
  }

  return NextResponse.json({ appointment });
}
