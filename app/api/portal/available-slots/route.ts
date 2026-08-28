import { NextResponse } from "next/server";
import { getPortalIdentity } from "@/lib/portal";
import { createServiceClient } from "@/lib/supabase/service";
import { DEFAULT_BUSINESS_HOURS, DEFAULT_SLOT_MINUTES, slotsForDay, filterAvailableSlots, type BusinessHours, type HolidayRange } from "@/lib/businessHours";
import { getExternalBusyBlocks } from "@/lib/calendarSync/freebusy";

// Reads services.is_bookable, system_settings, and every appointment on the
// requested day -- all things the portal session has no established RLS
// access to -- so this uses the service-role client, with the portal
// session itself verified via getPortalIdentity() (cookie-based, real auth,
// not bypassed).
export async function GET(request: Request) {
  const identity = await getPortalIdentity();
  if (!identity) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const serviceId = searchParams.get("serviceId");
  const dateParam = searchParams.get("date");
  if (!serviceId || !dateParam) return NextResponse.json({ error: "serviceId and date are required." }, { status: 400 });

  const date = new Date(`${dateParam}T00:00:00`);
  if (Number.isNaN(date.getTime())) return NextResponse.json({ error: "Invalid date." }, { status: 400 });

  const supabase = createServiceClient();

  const { data: service } = await supabase
    .from("services")
    .select("id, is_bookable, workspace_id, estimated_duration_minutes")
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
  const holidays = (holidaysSetting?.value as HolidayRange[] | undefined) ?? [];
  const durationMinutes = service.estimated_duration_minutes ?? gridMinutes;

  const dayStart = new Date(date);
  const dayEnd = new Date(date);
  dayEnd.setDate(dayEnd.getDate() + 1);

  const { data: existing } = await supabase
    .from("appointments")
    .select("start_at, end_at")
    .eq("workspace_id", identity.workspaceId)
    .neq("status", "cancelled")
    .gte("start_at", dayStart.toISOString())
    .lt("start_at", dayEnd.toISOString());

  // Also exclude slots blocked on a connected staff member's *personal*
  // Google/Outlook calendar, not just other Verexa appointments -- best
  // effort, never blocks booking if a calendar connection can't be reached.
  const externalBusy = await getExternalBusyBlocks(supabase, identity.workspaceId, dayStart.toISOString(), dayEnd.toISOString());

  const candidates = slotsForDay(date, businessHours, gridMinutes, durationMinutes, holidays);
  const available = filterAvailableSlots(candidates, durationMinutes, [...(existing ?? []), ...externalBusy], new Date());

  return NextResponse.json({ slots: available.map((s) => s.toISOString()), durationMinutes });
}
