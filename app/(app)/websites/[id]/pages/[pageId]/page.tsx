import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { PageBuilder } from "@/components/pages/PageBuilder";

export const dynamic = "force-dynamic";

export default async function SitePageBuilderRoute({ params }: { params: { id: string; pageId: string } }) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const supabase = createClient();
  const [{ data: page }, { data: website }, { data: sections }, { data: canManage }, { data: services }] = await Promise.all([
    supabase
      .from("site_pages")
      .select(
        "id, workspace_id, website_id, title, slug, meta_description, status, funnel_id, background_color, custom_css, custom_js, schema_markup"
      )
      .eq("id", params.pageId)
      .maybeSingle(),
    supabase.from("site_websites").select("id, slug").eq("id", params.id).maybeSingle(),
    supabase.from("site_page_sections").select("id, section_type, display_order, config").eq("page_id", params.pageId).order("display_order"),
    supabase.rpc("has_permission", { p_workspace_id: workspace.id, p_permission_key: "site_pages.manage" }),
    supabase.from("services").select("id, name").or(`workspace_id.is.null,workspace_id.eq.${workspace.id}`).eq("status", "published").order("display_order"),
  ]);

  if (!page || page.workspace_id !== workspace.id || page.website_id !== params.id || !website) notFound();

  return (
    <PageBuilder
      workspaceSlug={workspace.slug}
      websiteId={website.id}
      websiteSlug={website.slug}
      page={page}
      initialSections={(sections ?? []) as never}
      canManage={Boolean(canManage)}
      workspaceServices={services ?? []}
    />
  );
}
