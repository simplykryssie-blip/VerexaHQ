import { MapPin } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { SettingsSectionHeader } from "@/components/settings/SettingsSectionHeader";
import { LocationsManager, type LocationRow } from "@/components/settings/LocationsManager";

export const dynamic = "force-dynamic";

export default async function LocationsPage() {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const supabase = createClient();
  const [{ data: locations }, { data: canManage }] = await Promise.all([
    supabase
      .from("booking_locations")
      .select("id, name, address, timezone, hours, is_default")
      .eq("workspace_id", workspace.id)
      .order("display_order"),
    supabase.rpc("is_workspace_admin", { p_workspace_id: workspace.id }),
  ]);

  return (
    <div className="max-w-2xl">
      <SettingsSectionHeader
        icon={MapPin}
        title="Locations"
        description="Multiple offices with their own hours and timezone -- assign a service to one under its own settings to use that office's schedule instead of the workspace default."
      />
      <div className="mt-6">
        <LocationsManager workspaceId={workspace.id} locations={(locations ?? []) as LocationRow[]} canManage={Boolean(canManage)} />
      </div>
    </div>
  );
}
