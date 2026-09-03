import { CalendarOff } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { SettingsSectionHeader } from "@/components/settings/SettingsSectionHeader";
import { getWorkspaceStaff } from "@/lib/workspaceStaff";
import { MyAvailabilityManager } from "@/components/settings/MyAvailabilityManager";
import { BookingAvailabilityForm } from "@/components/settings/BookingAvailabilityForm";
import {
  DEFAULT_BUSINESS_HOURS,
  DEFAULT_SLOT_MINUTES,
  BOOKING_WINDOW_DAYS,
  DEFAULT_BOOKING_MIN_NOTICE_HOURS,
  DEFAULT_BOOKING_BUFFER_MINUTES,
  type BusinessHours,
  type HolidayRange,
} from "@/lib/businessHours";

export const dynamic = "force-dynamic";

export default async function AvailabilityPage() {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: canManageOthers }, { data: canManageSettings }, staff, { data: timeOff }, { data: settings }] = await Promise.all([
    supabase.rpc("has_permission", { p_workspace_id: workspace.id, p_permission_key: "users.manage" }),
    supabase.rpc("has_permission", { p_workspace_id: workspace.id, p_permission_key: "settings.manage" }),
    getWorkspaceStaff(supabase, workspace.id),
    supabase
      .from("staff_time_off")
      .select("id, user_id, start_date, end_date, reason")
      .eq("workspace_id", workspace.id)
      .order("start_date", { ascending: true }),
    supabase.from("system_settings").select("key, value").eq("workspace_id", workspace.id).order("key"),
  ]);

  const businessHours = (settings?.find((s) => s.key === "business_hours")?.value as BusinessHours | undefined) ?? DEFAULT_BUSINESS_HOURS;
  const slotMinutes = (settings?.find((s) => s.key === "booking_slot_minutes")?.value as number | undefined) ?? DEFAULT_SLOT_MINUTES;
  const holidays = (settings?.find((s) => s.key === "holidays")?.value as HolidayRange[] | undefined) ?? [];
  const windowDays = (settings?.find((s) => s.key === "booking_window_days")?.value as number | undefined) ?? BOOKING_WINDOW_DAYS;
  const minNoticeHours =
    (settings?.find((s) => s.key === "booking_min_notice_hours")?.value as number | undefined) ?? DEFAULT_BOOKING_MIN_NOTICE_HOURS;
  const bufferMinutes =
    (settings?.find((s) => s.key === "booking_buffer_minutes")?.value as number | undefined) ?? DEFAULT_BOOKING_BUFFER_MINUTES;

  return (
    <div className="max-w-2xl space-y-4">
      <SettingsSectionHeader
        icon={CalendarOff}
        title="Availability"
        description="Block off vacation and personal days so no one books you during that time. Everyone on the team can see who's out; you can only remove your own days unless you manage staff."
      />
      <MyAvailabilityManager
        workspaceId={workspace.id}
        workspaceSlug={workspace.slug}
        currentUserId={user?.id ?? null}
        staff={staff.map((s) => ({ id: s.user_id, label: s.display_name ?? "Staff member" }))}
        timeOff={timeOff ?? []}
        canManageOthers={Boolean(canManageOthers)}
      />
      {canManageSettings && (
        <BookingAvailabilityForm
          workspaceId={workspace.id}
          initialHours={businessHours}
          initialSlotMinutes={slotMinutes}
          initialHolidays={holidays}
          initialWindowDays={windowDays}
          initialMinNoticeHours={minNoticeHours}
          initialBufferMinutes={bufferMinutes}
        />
      )}
    </div>
  );
}
