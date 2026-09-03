import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { BOOKING_WINDOW_DAYS, DEFAULT_BOOKING_MIN_NOTICE_HOURS, DEFAULT_BOOKING_BUFFER_MINUTES } from "@/lib/businessHours";

export type BookingSettings = {
  windowDays: number;
  minNoticeHours: number;
  bufferMinutes: number;
};

// Same system_settings (workspace_id, key) -> jsonb value store business_hours/
// booking_slot_minutes/holidays already use -- each of these three is just a
// bare number, read together since every booking route (portal and public)
// needs all three every time.
export async function getBookingSettings(supabase: SupabaseClient<Database>, workspaceId: string): Promise<BookingSettings> {
  const { data } = await supabase
    .from("system_settings")
    .select("key, value")
    .eq("workspace_id", workspaceId)
    .in("key", ["booking_window_days", "booking_min_notice_hours", "booking_buffer_minutes"]);

  const byKey = new Map((data ?? []).map((row) => [row.key, row.value]));
  return {
    windowDays: (byKey.get("booking_window_days") as number | undefined) ?? BOOKING_WINDOW_DAYS,
    minNoticeHours: (byKey.get("booking_min_notice_hours") as number | undefined) ?? DEFAULT_BOOKING_MIN_NOTICE_HOURS,
    bufferMinutes: (byKey.get("booking_buffer_minutes") as number | undefined) ?? DEFAULT_BOOKING_BUFFER_MINUTES,
  };
}
