import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { PageHeader } from "@/components/PageHeader";
import { PageLibrary, type SitePageCard } from "@/components/pages/PageLibrary";

export const dynamic = "force-dynamic";

export default async function SitePagesPage() {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const supabase = createClient();

  const [{ data: pages }, { data: canManage }] = await Promise.all([
    supabase
      .from("site_pages")
      .select("id, title, slug, status, funnel_id")
      .eq("workspace_id", workspace.id)
      .is("funnel_id", null)
      .order("created_at", { ascending: false }),
    supabase.rpc("has_permission", { p_workspace_id: workspace.id, p_permission_key: "site_pages.manage" }),
  ]);

  const cards: SitePageCard[] = (pages ?? []).map((p) => ({ id: p.id, title: p.title, slug: p.slug, status: p.status }));

  return (
    <>
      <PageHeader
        title="Pages"
        description="Public marketing pages and lead-capture forms, hosted at your workspace's own address."
      />
      <div className="flex-1 px-8 py-6">
        <PageLibrary workspaceId={workspace.id} workspaceSlug={workspace.slug} pages={cards} canManage={Boolean(canManage)} />
      </div>
    </>
  );
}
