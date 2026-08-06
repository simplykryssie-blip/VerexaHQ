import { supabase } from "@/lib/supabase";

export type StaffOption = { userId: string; name: string };

/**
 * workspace_users.user_id has no declared foreign key to user_profiles (only
 * role_id -> roles and workspace_id -> workspaces are real FKs), so
 * PostgREST can't embed the profile in a nested select — this looks names up
 * in a single extra query instead.
 */
export async function getStaffNames(userIds: (string | null | undefined)[]): Promise<Map<string, string>> {
  const ids = Array.from(new Set(userIds.filter((id): id is string => Boolean(id))));
  const map = new Map<string, string>();
  if (ids.length === 0) return map;

  const { data, error } = await supabase
    .from("user_profiles")
    .select("id, display_name, first_name, last_name")
    .in("id", ids);

  if (error || !data) return map;

  for (const profile of data) {
    const name =
      profile.display_name ||
      [profile.first_name, profile.last_name].filter(Boolean).join(" ") ||
      "Team member";
    map.set(profile.id, name);
  }
  return map;
}

/** Active workspace_users members with a resolved display name, for assignee pickers. */
export async function listActiveStaff(workspaceId: string): Promise<StaffOption[]> {
  const { data, error } = await supabase
    .from("workspace_users")
    .select("user_id")
    .eq("workspace_id", workspaceId)
    .eq("status", "active");

  if (error || !data) return [];

  const userIds = data.map((row) => row.user_id);
  const nameMap = await getStaffNames(userIds);
  return userIds.map((id) => ({ userId: id, name: nameMap.get(id) ?? "Team member" }));
}

/** Every workspace_users member (any status) mapped to a resolved display name, for "assigned to" labels. */
export async function getWorkspaceMemberNames(workspaceId: string): Promise<Map<string, string>> {
  const { data, error } = await supabase.from("workspace_users").select("user_id").eq("workspace_id", workspaceId);
  if (error || !data) return new Map();
  return getStaffNames(data.map((row) => row.user_id));
}
