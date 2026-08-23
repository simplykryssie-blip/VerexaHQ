import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export const ACTIVE_WORKSPACE_COOKIE = "active_workspace_id";

export type CurrentWorkspace = {
  id: string;
  name: string;
  slug: string;
  workspace_type: string;
  is_owner: boolean;
};

function toCurrentWorkspace(row: {
  is_owner: boolean;
  workspaces: { id: string; name: string; slug: string; workspace_type: string } | null;
}): CurrentWorkspace | null {
  if (!row.workspaces) return null;
  const ws = row.workspaces;
  return { id: ws.id, name: ws.name, slug: ws.slug, workspace_type: ws.workspace_type, is_owner: row.is_owner };
}

export async function getCurrentWorkspace(): Promise<CurrentWorkspace | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // Platform admins/IT can switch into a demo workspace (or back to their
  // own) via /api/workspace/switch, which sets this cookie after verifying
  // real active membership -- so it's re-verified here too rather than
  // trusted outright, in case membership was revoked since the cookie was
  // set. Anyone else simply never has this cookie.
  const activeWorkspaceId = cookies().get(ACTIVE_WORKSPACE_COOKIE)?.value;
  if (activeWorkspaceId) {
    const { data } = await supabase
      .from("workspace_users")
      .select("is_owner, workspaces(id, name, slug, workspace_type)")
      .eq("user_id", user.id)
      .eq("workspace_id", activeWorkspaceId)
      .eq("status", "active")
      .maybeSingle();
    const current = data ? toCurrentWorkspace(data as unknown as { is_owner: boolean; workspaces: CurrentWorkspace | null }) : null;
    if (current) return current;
  }

  const { data } = await supabase
    .from("workspace_users")
    .select("is_owner, workspaces(id, name, slug, workspace_type)")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return data ? toCurrentWorkspace(data as unknown as { is_owner: boolean; workspaces: CurrentWorkspace | null }) : null;
}
