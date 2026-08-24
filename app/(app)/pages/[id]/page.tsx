import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { PageBuilder } from "@/components/pages/PageBuilder";

export const dynamic = "force-dynamic";

export default async function SitePageBuilderRoute({ params }: { params: { id: string } }) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const supabase = createClient();
  const [{ data: page }, { data: sections }, { data: canManage }, { data: services }] = await Promise.all([
    supabase.from("site_pages").select("id, workspace_id, title, slug, meta_description, status, funnel_id").eq("id", params.id).maybeSingle(),
    supabase.from("site_page_sections").select("id, section_type, display_order, config").eq("page_id", params.id).order("display_order"),
    supabase.rpc("has_permission", { p_workspace_id: workspace.id, p_permission_key: "site_pages.manage" }),
    supabase.from("services").select("id, name").or(`workspace_id.is.null,workspace_id.eq.${workspace.id}`).eq("status", "published").order("display_order"),
  ]);

  if (!page || page.workspace_id !== workspace.id) notFound();

  return (
    <PageBuilder
      workspaceSlug={workspace.slug}
      page={page}
      initialSections={(sections ?? []) as never}
      canManage={Boolean(canManage)}
      workspaceServices={services ?? []}
    />
  );
}
