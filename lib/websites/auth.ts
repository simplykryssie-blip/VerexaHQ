import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";

type AuthorizedWebsite = { id: string; workspace_id: string; custom_domain: string | null };

/** Shared by the website domain API routes: confirms the caller can manage this website, or returns the 401/403/404 to send back. */
export async function authorizedWebsite(
  id: string
): Promise<{ website: AuthorizedWebsite } | { error: NextResponse }> {
  const workspace = await getCurrentWorkspace();
  if (!workspace) {
    return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  }

  const supabase = createClient();
  const { data: canManage } = await supabase.rpc("has_permission", {
    p_workspace_id: workspace.id,
    p_permission_key: "site_pages.manage",
  });
  if (!canManage) {
    return { error: NextResponse.json({ error: "You don't have permission to manage this website." }, { status: 403 }) };
  }

  const { data: website } = await supabase
    .from("site_websites")
    .select("id, workspace_id, custom_domain")
    .eq("id", id)
    .maybeSingle();

  if (!website || website.workspace_id !== workspace.id) {
    return { error: NextResponse.json({ error: "Website not found." }, { status: 404 }) };
  }
  return { website };
}
