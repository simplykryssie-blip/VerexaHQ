import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type AuthorizedWebsite = { id: string; workspace_id: string; custom_domain: string | null };

// Checks permission against the website's OWN workspace_id, not whichever
// workspace happens to be "active" in the caller's session right now.
// This used to require an exact match against getCurrentWorkspace() (the
// active_workspace_id cookie a platform admin sets when switching into a
// demo workspace to test something) -- so a platform admin who switched
// into a demo workspace in one tab, then went back to managing their own
// real website's domain in another tab (or without reloading), got a
// confusing "Website not found" here even though the website update
// itself (a direct RLS-gated table write, unrelated to "active workspace")
// had just succeeded. Real membership/permission on the website's actual
// workspace is the correct check -- it doesn't depend on which workspace
// the UI happens to be showing elsewhere in the session.
export async function authorizedWebsite(
  id: string
): Promise<{ website: AuthorizedWebsite } | { error: NextResponse }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  }

  const { data: website } = await supabase
    .from("site_websites")
    .select("id, workspace_id, custom_domain")
    .eq("id", id)
    .maybeSingle();

  if (!website) {
    return { error: NextResponse.json({ error: "Website not found." }, { status: 404 }) };
  }

  const { data: canManage } = await supabase.rpc("has_permission", {
    p_workspace_id: website.workspace_id,
    p_permission_key: "site_pages.manage",
  });
  if (!canManage) {
    return { error: NextResponse.json({ error: "You don't have permission to manage this website." }, { status: 403 }) };
  }

  return { website };
}
