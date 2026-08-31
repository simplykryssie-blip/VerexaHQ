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

export type WorkspaceMemberWorkload = {
  id: string;
  user_id: string;
  status: string;
  is_owner: boolean;
  role_id: string;
  display_name: string | null;
  avatar_url: string | null;
  role_name: string | null;
  email: string | null;
  joined_at: string | null;
  last_seen_at: string | null;
  assignedClientCount: number;
  openTaskCount: number;
};

// Same members-plus-profile join pattern as getWorkspaceStaff above, extended
// with a per-member workload summary. Shared by the Users & Staff table and
// the ERO Dashboard's Team Workload panel so both always agree on what
// "assigned clients" and "open tasks" mean for a given person.
export async function getWorkspaceMemberWorkload(
  supabase: SupabaseClient<Database>,
  workspaceId: string
): Promise<{ members: WorkspaceMemberWorkload[]; roles: { id: string; name: string }[] }> {
  const [{ data: membersRaw, error: membersError }, { data: roles }, { data: emailRows }] = await Promise.all([
    supabase
      .from("workspace_users")
      .select("id, user_id, status, is_owner, role_id, joined_at")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: true }),
    supabase.from("roles").select("id, name").or(`workspace_id.is.null,workspace_id.eq.${workspaceId}`).order("name"),
    supabase.rpc("get_workspace_member_emails", { p_workspace_id: workspaceId }),
  ]);

  if (membersError) {
    console.error("getWorkspaceMemberWorkload: could not load workspace_users", membersError);
  }

  const roleNameById = new Map((roles ?? []).map((r) => [r.id, r.name]));
  const userIds = Array.from(new Set((membersRaw ?? []).map((m) => m.user_id)));
  const emailByUserId = new Map((emailRows ?? []).map((r) => [r.user_id, r.email]));

  const [{ data: profiles }, { data: taskRows }, { data: clientRmRows }, { data: engagementRows }] = userIds.length
    ? await Promise.all([
        supabase.from("user_profiles").select("id, display_name, avatar_url, last_seen_at").in("id", userIds),
        // Open tasks: anything not yet completed, assigned directly to this person.
        supabase.from("tasks").select("assigned_staff_id, status").eq("workspace_id", workspaceId).in("assigned_staff_id", userIds),
        // Assigned clients: a client relationship-managed by this person...
        supabase.from("clients").select("id, relationship_manager_id").eq("workspace_id", workspaceId).in("relationship_manager_id", userIds),
        // ...or one whose engagement this person is the assigned preparer on --
        // a client can show up in both sets, so these get de-duplicated by
        // client id below rather than summed.
        supabase.from("engagements").select("client_id, assigned_staff_id").eq("workspace_id", workspaceId).in("assigned_staff_id", userIds),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }];
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

  const openTaskCountByUser = new Map<string, number>();
  for (const t of taskRows ?? []) {
    if (t.status === "completed" || !t.assigned_staff_id) continue;
    openTaskCountByUser.set(t.assigned_staff_id, (openTaskCountByUser.get(t.assigned_staff_id) ?? 0) + 1);
  }
  const assignedClientIdsByUser = new Map<string, Set<string>>();
  function addAssignedClient(userId: string | null, clientId: string | null) {
    if (!userId || !clientId) return;
    if (!assignedClientIdsByUser.has(userId)) assignedClientIdsByUser.set(userId, new Set());
    assignedClientIdsByUser.get(userId)!.add(clientId);
  }
  for (const c of clientRmRows ?? []) addAssignedClient(c.relationship_manager_id, c.id);
  for (const e of engagementRows ?? []) addAssignedClient(e.assigned_staff_id, e.client_id);

  const members: WorkspaceMemberWorkload[] = (membersRaw ?? []).map((m) => ({
    id: m.id,
    user_id: m.user_id,
    status: m.status,
    is_owner: m.is_owner,
    role_id: m.role_id,
    display_name: profileById.get(m.user_id)?.display_name ?? null,
    avatar_url: profileById.get(m.user_id)?.avatar_url ?? null,
    role_name: roleNameById.get(m.role_id) ?? null,
    email: emailByUserId.get(m.user_id) ?? null,
    joined_at: m.joined_at,
    last_seen_at: profileById.get(m.user_id)?.last_seen_at ?? null,
    assignedClientCount: assignedClientIdsByUser.get(m.user_id)?.size ?? 0,
    openTaskCount: openTaskCountByUser.get(m.user_id) ?? 0,
  }));

  return { members, roles: roles ?? [] };
}
