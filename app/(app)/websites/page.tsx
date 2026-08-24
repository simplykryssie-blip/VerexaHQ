import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { PageHeader } from "@/components/PageHeader";
import { WebsiteLibrary, type WebsiteCard } from "@/components/websites/WebsiteLibrary";

export const dynamic = "force-dynamic";

export default async function WebsitesPage() {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const supabase = createClient();

  const [{ data: websites }, { data: canManage }, { data: folders }] = await Promise.all([
    supabase
      .from("site_websites")
      .select("id, name, slug, status, folder_id, site_pages(id)")
      .eq("workspace_id", workspace.id)
      .order("name"),
    supabase.rpc("has_permission", { p_workspace_id: workspace.id, p_permission_key: "site_pages.manage" }),
    supabase.from("library_folders").select("id, parent_folder_id, name").eq("workspace_id", workspace.id).eq("item_type", "website").order("name"),
  ]);

  const cards: WebsiteCard[] = (websites ?? []).map((w) => ({
    id: w.id,
    name: w.name,
    slug: w.slug,
    status: w.status,
    folder_id: w.folder_id,
    page_count: (w.site_pages as unknown as { id: string }[]).length,
  }));

  return (
    <>
      <PageHeader
        title="Websites"
        description="Public marketing sites, funnels, and lead-capture forms, hosted at your workspace's own address."
      />
      <div className="flex-1 px-8 py-6">
        <WebsiteLibrary workspaceId={workspace.id} workspaceSlug={workspace.slug} websites={cards} folders={folders ?? []} canManage={Boolean(canManage)} />
      </div>
    </>
  );
}
