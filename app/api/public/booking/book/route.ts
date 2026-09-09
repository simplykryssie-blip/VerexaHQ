import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { checkRateLimit, clientIp } from "@/lib/rateLimit";
import { DEFAULT_SLOT_MINUTES, slotsForDay, filterAvailableSlots, isServiceBookableOnDate, isDateInAnyRange } from "@/lib/businessHours";
import { getExternalBusyBlocks } from "@/lib/calendarSync/freebusy";
import { resolveEffectiveAvailability } from "@/lib/bookingAvailability";
import { zonedTimeToUtc, isoDateInZone } from "@/lib/timezone";
import { resolveBookedMeeting } from "@/lib/zoom/bookingMeeting";
import { sendEmailViaResend } from "@/lib/email/resend";
import { renderEmail } from "@/lib/email/template";

// Public, unauthenticated equivalent of /api/portal/book-appointment.
// Re-validates the slot server-side exactly like the portal route does
// (never trusts what the browser posted back), then resolves the visitor
// to a client record -- reusing find_or_create_public_lead, the same
// dedup-by-email-or-phone RPC every other public capture path in this app
// already uses (the public organizer form, public site pages) -- so a
// returning client gets attached to their existing record and a new
// visitor becomes a lead, consistently with the rest of the app.
export async function POST(request: Request) {
  const allowed = await checkRateLimit(`public-booking-book:${clientIp(request)}`, 20, 3600);
  if (!allowed) return NextResponse.json({ error: "Too many requests. Try again shortly." }, { status: 429 });

  const body = (await request.json().catch(() => null)) as {
    workspaceSlug?: string;
    serviceId?: string;
    staffId?: string | null;
    startAt?: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
  } | null;

  const workspaceSlug = body?.workspaceSlug;
  const serviceId = body?.serviceId;
  const staffId = body?.staffId || null;
  const startAt = body?.startAt;
  const firstName = body?.firstName?.trim();
  const lastName = body?.lastName?.trim();
  const email = body?.email?.trim();
  const phone = body?.phone?.trim();

  if (!workspaceSlug || !serviceId || !startAt) {
    return NextResponse.json({ error: "workspaceSlug, serviceId and startAt are required." }, { status: 400 });
  }
  if (!firstName || !email) {
    return NextResponse.json({ error: "Name and email are required." }, { status: 400 });
  }

  const start = new Date(startAt);
  if (Number.isNaN(start.getTime())) return NextResponse.json({ error: "Invalid start time." }, { status: 400 });

  const supabase = createServiceClient();

  const { data: workspace } = await supabase.from("workspaces").select("id, name, slug").eq("slug", workspaceSlug).maybeSingle();
  if (!workspace) return NextResponse.json({ error: "This booking page isn't available." }, { status: 404 });

  const { data: service } = await supabase
    .from("services")
    .select(
      "id, name, is_bookable, is_portal_visible, workspace_id, estimated_duration_minutes, season_start, season_end, allowed_weekdays, booking_location_type, booking_meeting_url, zoom_host_user_id, allow_overlapping_bookings, booking_min_notice_hours_override, booking_buffer_minutes_override, booking_window_days_override, booking_location_id, organizer_template_id"
    )
    .eq("id", serviceId)
    .maybeSingle();
  if (!service || service.workspace_id !== workspace.id || !service.is_bookable || !service.is_portal_visible) {
    return NextResponse.json({ error: "This service isn't bookable." }, { status: 404 });
  }
  if (!isServiceBookableOnDate(start, { seasonStart: service.season_start, seasonEnd: service.season_end, allowedWeekdays: service.allowed_weekdays })) {
    return NextResponse.json({ error: "This service isn't bookable on that date." }, { status: 409 });
  }

  if (staffId) {
    const { data: membership } = await supabase
      .from("workspace_users")
      .select("user_id")
      .eq("workspace_id", workspace.id)
      .eq("user_id", staffId)
      .eq("status", "active")
      .maybeSingle();
    if (!membership) return NextResponse.json({ error: "That team member isn't available for booking." }, { status: 404 });
  }

  const { hours, timeZone, gridMinutes, holidays, minNoticeHours, bufferMinutes, windowDays } = await resolveEffectiveAvailability(
    supabase,
    workspace.id,
    staffId,
    service
  );

  if (staffId) {
    const { data: timeOff } = await supabase
      .from("staff_time_off")
      .select("start_date, end_date")
      .eq("workspace_id", workspace.id)
      .eq("user_id", staffId);
    if (isDateInAnyRange(isoDateInZone(start, timeZone), (timeOff ?? []).map((t) => ({ start: t.start_date, end: t.end_date })))) {
      return NextResponse.json({ error: "That time is no longer available. Pick another slot." }, { status: 409 });
    }
  }

  const windowEnd = new Date();
  windowEnd.setDate(windowEnd.getDate() + windowDays);
  if (start > windowEnd) {
    return NextResponse.json({ error: "That time is too far out to book." }, { status: 409 });
  }

  const durationMinutes = service.estimated_duration_minutes ?? gridMinutes;
  const isoDate = isoDateInZone(start, timeZone);
  const dayStart = zonedTimeToUtc(isoDate, "00:00", timeZone);
  const dayEnd = zonedTimeToUtc(isoDate, "00:00", timeZone);
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

  const externalBusy = await getExternalBusyBlocks(supabase, workspace.id, dayStart.toISOString(), dayEnd.toISOString());

  const busyBlocks = service.allow_overlapping_bookings ? externalBusy : [...(existing ?? []), ...externalBusy];
  const earliestStart = new Date(Date.now() + minNoticeHours * 3600000);
  const candidates = slotsForDay(isoDate, timeZone, hours, gridMinutes, durationMinutes, holidays);
  const available = filterAvailableSlots(candidates, durationMinutes, busyBlocks, earliestStart, bufferMinutes);
  const stillAvailable = available.some((s) => s.getTime() === start.getTime());
  if (!stillAvailable) {
    return NextResponse.json({ error: "That time is no longer available. Pick another slot." }, { status: 409 });
  }

  const { data: clientId, error: leadError } = await supabase.rpc("find_or_create_public_lead", {
    p_workspace_id: workspace.id,
    p_first_name: firstName,
    p_last_name: lastName ?? "",
    p_email: email,
    p_phone: phone ?? "",
  });
  if (leadError || !clientId) {
    return NextResponse.json({ error: leadError?.message ?? "Could not process your booking." }, { status: 500 });
  }

  const end = new Date(start.getTime() + durationMinutes * 60000);
  const { location, meetingUrl } = await resolveBookedMeeting(supabase, {
    locationType: service.booking_location_type,
    staticMeetingUrl: service.booking_meeting_url,
    staffId,
    zoomHostUserId: service.zoom_host_user_id,
    topic: `${service.name} with ${workspace.name}`,
    startTimeIso: start.toISOString(),
    durationMinutes,
  });

  const { data: appointment, error } = await supabase
    .from("appointments")
    .insert({
      workspace_id: workspace.id,
      client_id: clientId,
      staff_id: staffId,
      service_id: service.id,
      title: `${service.name} (booked online)`,
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

  const when = start.toLocaleString("en-US", {
    timeZone,
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
  await sendEmailViaResend({
    to: email,
    sender: "team",
    workspaceId: workspace.id,
    subject: `Confirmed: ${service.name} with ${workspace.name}`,
    html: renderEmail({
      heading: "You're booked",
      bodyHtml: `<p><strong>${service.name}</strong> with ${workspace.name}</p><p>${when}</p><p>${
        meetingUrl ? `Meeting link: <a href="${meetingUrl}">${meetingUrl}</a>` : "We'll call you at the number you provided."
      }</p>`,
    }),
  });

  // The service links to a template by its internal id, but the public
  // organizer form is keyed by its separate share token -- resolve it here
  // so the booking flow can show the question form without a second
  // unauthenticated lookup exposing the raw template id.
  let organizerToken: string | null = null;
  if (service.organizer_template_id) {
    const { data: template } = await supabase
      .from("organizer_templates")
      .select("public_token")
      .eq("id", service.organizer_template_id)
      .maybeSingle();
    organizerToken = template?.public_token ?? null;
  }

  return NextResponse.json({ appointment, clientId, organizerToken });
}
