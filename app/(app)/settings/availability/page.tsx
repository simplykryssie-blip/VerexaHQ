import { CalendarOff } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { SettingsSectionHeader } from "@/components/settings/SettingsSectionHeader";
import { getWorkspaceStaff } from "@/lib/workspaceStaff";
import { MyAvailabilityManager } from "@/components/settings/MyAvailabilityManager";

export const dynamic = "force-dynamic";

export default async function AvailabilityPage() {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: canManageOthers }, staff, { data: timeOff }] = await Promise.all([
    supabase.rpc("has_permission", { p_workspace_id: workspace.id, p_permission_key: "users.manage" }),
    getWorkspaceStaff(supabase, workspace.id),
    supabase
      .from("staff_time_off")
      .select("id, user_id, start_date, end_date, reason")
      .eq("workspace_id", workspace.id)
      .order("start_date", { ascending: true }),
  ]);

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
    </div>
  );
}
