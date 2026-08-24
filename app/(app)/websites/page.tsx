import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { PageHeader } from "@/components/PageHeader";
import { WebsiteLibrary, type WebsiteCard } from "@/components/websites/WebsiteLibrary";

export const dynamic = "force-dynamic";

export default async function WebsitesPage() {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const supabase = createClient();

  const [{ data: websites }, { data: canManage }] = await Promise.all([
    supabase
      .from("site_websites")
      .select("id, name, slug, status, site_pages(id)")
      .eq("workspace_id", workspace.id)
      .order("created_at", { ascending: false }),
    supabase.rpc("has_permission", { p_workspace_id: workspace.id, p_permission_key: "site_pages.manage" }),
  ]);

  const cards: WebsiteCard[] = (websites ?? []).map((w) => ({
    id: w.id,
    name: w.name,
    slug: w.slug,
    status: w.status,
    page_count: (w.site_pages as unknown as { id: string }[]).length,
  }));

  return (
    <>
      <PageHeader
        title="Websites"
        description="Public marketing sites, funnels, and lead-capture forms, hosted at your workspace's own address."
      />
      <div className="flex-1 px-8 py-6">
        <WebsiteLibrary workspaceId={workspace.id} workspaceSlug={workspace.slug} websites={cards} canManage={Boolean(canManage)} />
      </div>
    </>
  );
}
