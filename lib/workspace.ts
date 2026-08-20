import { createClient } from "@/lib/supabase/server";

export type CurrentWorkspace = {
  id: string;
  name: string;
  slug: string;
  workspace_type: string;
  is_owner: boolean;
};

export async function getCurrentWorkspace(): Promise<CurrentWorkspace | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("workspace_users")
    .select("is_owner, workspaces(id, name, slug, workspace_type)")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!data || !data.workspaces) return null;

  const ws = data.workspaces as unknown as {
    id: string;
    name: string;
    slug: string;
    workspace_type: string;
  };

  return { id: ws.id, name: ws.name, slug: ws.slug, workspace_type: ws.workspace_type, is_owner: data.is_owner };
}
