import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

export type WorkspaceStaffMember = {
  user_id: string;
  is_owner: boolean;
  display_name: string | null;
  avatar_url: string | null;
};

// workspace_users has no direct foreign key to user_profiles -- both it and
// workspace_users.user_id independently reference auth.users -- so
// PostgREST can't auto-embed `user_profiles(...)` off a workspace_users
// select. That embed silently returns no rows (the resulting relationship
// error goes unnoticed by any caller that only destructures { data }),
// which is how this same latent bug turned up repeatedly across the app:
// staff-assignment dropdowns and "who's on this team" displays silently
// empty. Fetched and joined separately here instead, once, so future call
// sites don't reintroduce it.
export async function getWorkspaceStaff(
  supabase: SupabaseClient<Database>,
  workspaceId: string,
  options: { activeOnly?: boolean } = {}
): Promise<WorkspaceStaffMember[]> {
  const { activeOnly = true } = options;
  let query = supabase.from("workspace_users").select("user_id, is_owner").eq("workspace_id", workspaceId);
  if (activeOnly) query = query.eq("status", "active");
  const { data: members } = await query;

  const userIds = Array.from(new Set((members ?? []).map((m) => m.user_id)));
  const { data: profiles } = userIds.length
    ? await supabase.from("user_profiles").select("id, display_name, avatar_url").in("id", userIds)
    : { data: [] };
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

  return (members ?? []).map((m) => ({
    user_id: m.user_id,
    is_owner: m.is_owner,
    display_name: profileById.get(m.user_id)?.display_name ?? null,
    avatar_url: profileById.get(m.user_id)?.avatar_url ?? null,
  }));
}
