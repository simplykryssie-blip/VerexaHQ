import { Globe, CheckCircle2, PenLine, FileText } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { PageHero, HeroHighlight } from "@/components/ui/PageHero";
import { StatTile } from "@/components/ui/StatTile";
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

  const publishedCount = cards.filter((c) => c.status === "published").length;
  const draftCount = cards.filter((c) => c.status === "draft").length;
  const totalPages = cards.reduce((sum, c) => sum + c.page_count, 0);

  return (
    <>
      <PageHero
        icon={Globe}
        tone="accent"
        heading={
          <>
            Your <HeroHighlight>websites & funnels</HeroHighlight>.
          </>
        }
        subtitle="Public marketing sites, funnels, and lead-capture forms, hosted at your workspace's own address."
      />
      <div className="flex-1 space-y-6 px-8 py-6">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatTile icon={Globe} tone="accent" label="Websites" value={cards.length} />
          <StatTile icon={CheckCircle2} tone="emerald" label="Published" value={publishedCount} />
          <StatTile icon={PenLine} tone="amber" label="Draft" value={draftCount} />
          <StatTile icon={FileText} tone="violet" label="Total pages" value={totalPages} />
        </div>
        <WebsiteLibrary workspaceId={workspace.id} workspaceSlug={workspace.slug} websites={cards} folders={folders ?? []} canManage={Boolean(canManage)} />
      </div>
    </>
  );
}
