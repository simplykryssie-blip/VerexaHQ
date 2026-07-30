import "server-only";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import type { MembershipRole } from "@/lib/permissions/roles";
import type { Tables } from "@/types/database";

export const SELECTED_WORKSPACE_COOKIE = "verexa-tax-office-workspace";

export type WorkspaceMembership = {
  membershipId: string;
  role: MembershipRole;
  status: Tables<"workspace_members">["status"];
  workspace: Tables<"workspaces">;
};

/** Every active workspace the signed-in user belongs to. RLS on
 * workspace_members scopes this to the caller's own rows — never trusted
 * as the only boundary, but there is no legitimate case where a user
 * should see another user's membership row. */
export async function getUserMemberships(): Promise<WorkspaceMembership[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("workspace_members")
    .select("id, role, status, workspace:workspaces(*)")
    .eq("user_id", user.id)
    .eq("status", "active");

  if (error || !data) return [];

  return data
    .filter((row) => row.workspace)
    .map((row) => ({
      membershipId: row.id,
      role: row.role,
      status: row.status,
      workspace: row.workspace as unknown as Tables<"workspaces">,
    }));
}

export async function getSelectedWorkspaceId(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(SELECTED_WORKSPACE_COOKIE)?.value ?? null;
}

/** Resolves which workspace + membership the current request should act
 * as: the cookie-selected one if the user still belongs to it, otherwise
 * falls back to the first (single-workspace users never see a chooser). */
export async function getActiveWorkspace(): Promise<WorkspaceMembership | null> {
  const memberships = await getUserMemberships();
  if (memberships.length === 0) return null;

  const selectedId = await getSelectedWorkspaceId();
  const selected = memberships.find((m) => m.workspace.id === selectedId);
  return selected ?? memberships[0];
}
