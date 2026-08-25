import { NextResponse } from "next/server";
import { getPortalIdentity } from "@/lib/portal";
import { createServiceClient } from "@/lib/supabase/service";
import { DEFAULT_BUSINESS_HOURS, DEFAULT_SLOT_MINUTES, slotsForDay, filterAvailableSlots, type BusinessHours } from "@/lib/businessHours";
import { getExternalBusyBlocks } from "@/lib/calendarSync/freebusy";

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
    .select("id, name, is_bookable, workspace_id, estimated_duration_minutes")
    .eq("id", serviceId)
    .maybeSingle();
  if (!service || service.workspace_id !== identity.workspaceId || !service.is_bookable) {
    return NextResponse.json({ error: "This service isn't bookable." }, { status: 404 });
  }

  const { data: hoursSetting } = await supabase
    .from("system_settings")
    .select("value")
    .eq("workspace_id", identity.workspaceId)
    .eq("key", "business_hours")
    .maybeSingle();
  const { data: slotSetting } = await supabase
    .from("system_settings")
    .select("value")
    .eq("workspace_id", identity.workspaceId)
    .eq("key", "booking_slot_minutes")
    .maybeSingle();
  const { data: holidaysSetting } = await supabase
    .from("system_settings")
    .select("value")
    .eq("workspace_id", identity.workspaceId)
    .eq("key", "holidays")
    .maybeSingle();

  const businessHours = (hoursSetting?.value as BusinessHours | undefined) ?? DEFAULT_BUSINESS_HOURS;
  const gridMinutes = (slotSetting?.value as number | undefined) ?? DEFAULT_SLOT_MINUTES;
  const holidays = (holidaysSetting?.value as string[] | undefined) ?? [];
  const durationMinutes = service.estimated_duration_minutes ?? gridMinutes;

  const dayStart = new Date(start);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  const { data: existing } = await supabase
    .from("appointments")
    .select("start_at, end_at")
    .eq("workspace_id", identity.workspaceId)
    .neq("status", "cancelled")
    .gte("start_at", dayStart.toISOString())
    .lt("start_at", dayEnd.toISOString());

  const externalBusy = await getExternalBusyBlocks(supabase, identity.workspaceId, dayStart.toISOString(), dayEnd.toISOString());

  const candidates = slotsForDay(dayStart, businessHours, gridMinutes, durationMinutes, holidays);
  const available = filterAvailableSlots(candidates, durationMinutes, [...(existing ?? []), ...externalBusy], new Date());
  const stillAvailable = available.some((s) => s.getTime() === start.getTime());
  if (!stillAvailable) {
    return NextResponse.json({ error: "That time is no longer available. Pick another slot." }, { status: 409 });
  }

  const end = new Date(start.getTime() + durationMinutes * 60000);

  const { data: appointment, error } = await supabase
    .from("appointments")
    .insert({
      workspace_id: identity.workspaceId,
      client_id: identity.clientId,
      staff_id: null,
      title: `${service.name} (client-booked)`,
      description: null,
      location: null,
      meeting_url: null,
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
