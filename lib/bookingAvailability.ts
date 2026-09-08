import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { DEFAULT_BUSINESS_HOURS, DEFAULT_SLOT_MINUTES, type BusinessHours, type HolidayRange } from "@/lib/businessHours";
import { getBookingSettings } from "@/lib/bookingSettings";

export type ResolvedAvailability = {
  hours: BusinessHours;
  timeZone: string;
  gridMinutes: number;
  holidays: HolidayRange[];
  minNoticeHours: number;
  bufferMinutes: number;
  windowDays: number;
};

type ServiceOverrides = {
  booking_min_notice_hours_override?: number | null;
  booking_buffer_minutes_override?: number | null;
  booking_window_days_override?: number | null;
  booking_location_id?: string | null;
};

// Matches the NOT NULL default on workspaces.timezone -- only used if a
// workspace row somehow can't be read at all.
const DEFAULT_TIMEZONE = "America/New_York";

// Resolves the effective hours/timezone/grid/holidays/notice/buffer/window a
// booking should use, in priority order:
//   1. staffId with their own working-hours override -> their hours + their
//      personal timezone (falls back to the workspace timezone if they
//      haven't set one) -- "book time with a specific person" is about when
//      that person is free, more specific than when the office is open.
//   2. no staffId, but the service is assigned a location -> that
//      location's hours + timezone.
//   3. the workspace's own shared defaults.
// Per-service notice/buffer/window overrides apply independently of which
// of the three hours sources above was used.
export async function resolveEffectiveAvailability(
  supabase: SupabaseClient<Database>,
  workspaceId: string,
  staffId: string | null,
  service: ServiceOverrides
): Promise<ResolvedAvailability> {
  const [{ data: workspace }, { data: settings }, { windowDays, minNoticeHours, bufferMinutes }] = await Promise.all([
    supabase.from("workspaces").select("timezone").eq("id", workspaceId).maybeSingle(),
    supabase
      .from("system_settings")
      .select("key, value")
      .eq("workspace_id", workspaceId)
      .in("key", ["business_hours", "booking_slot_minutes", "holidays"]),
    getBookingSettings(supabase, workspaceId),
  ]);
  const byKey = new Map((settings ?? []).map((row) => [row.key, row.value]));

  let hours = (byKey.get("business_hours") as BusinessHours | undefined) ?? DEFAULT_BUSINESS_HOURS;
  let timeZone = workspace?.timezone || DEFAULT_TIMEZONE;

  if (staffId) {
    const [{ data: staffHours }, { data: profile }] = await Promise.all([
      supabase.from("staff_business_hours").select("hours").eq("workspace_id", workspaceId).eq("user_id", staffId).maybeSingle(),
      supabase.from("user_profiles").select("timezone").eq("id", staffId).maybeSingle(),
    ]);
    if (staffHours?.hours) hours = staffHours.hours as BusinessHours;
    if (profile?.timezone) timeZone = profile.timezone;
  } else if (service.booking_location_id) {
    const { data: location } = await supabase
      .from("booking_locations")
      .select("hours, timezone")
      .eq("id", service.booking_location_id)
      .maybeSingle();
    if (location?.hours) hours = location.hours as BusinessHours;
    if (location?.timezone) timeZone = location.timezone;
  }

  return {
    hours,
    timeZone,
    gridMinutes: (byKey.get("booking_slot_minutes") as number | undefined) ?? DEFAULT_SLOT_MINUTES,
    holidays: (byKey.get("holidays") as HolidayRange[] | undefined) ?? [],
    minNoticeHours: service.booking_min_notice_hours_override ?? minNoticeHours,
    bufferMinutes: service.booking_buffer_minutes_override ?? bufferMinutes,
    windowDays: service.booking_window_days_override ?? windowDays,
  };
}
