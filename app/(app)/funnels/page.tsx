import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { PageHeader } from "@/components/PageHeader";
import { AllFunnelsLibrary, type FunnelWithWebsite } from "@/components/websites/AllFunnelsLibrary";

export const dynamic = "force-dynamic";

export default async function AllFunnelsPage() {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const supabase = createClient();

  const { data: websites } = await supabase.from("site_websites").select("id, name").eq("workspace_id", workspace.id).order("name");
  const websiteIds = (websites ?? []).map((w) => w.id);

  const { data: funnels } =
    websiteIds.length > 0
      ? await supabase
          .from("site_funnels")
          .select("id, name, status, website_id, site_pages(id)")
          .in("website_id", websiteIds)
          .order("created_at", { ascending: false })
      : { data: [] as never[] };

  const websiteNameById = new Map((websites ?? []).map((w) => [w.id, w.name]));
  const cards: FunnelWithWebsite[] = (funnels ?? []).map((f) => ({
    id: f.id,
    name: f.name,
    status: f.status,
    website_id: f.website_id,
    website_name: websiteNameById.get(f.website_id) ?? "Unknown website",
    page_count: (f.site_pages as unknown as { id: string }[]).length,
  }));

  return (
    <>
      <PageHeader title="Funnels" description="Every funnel across all of your websites, in one place." />
      <div className="flex-1 px-8 py-6">
        <AllFunnelsLibrary funnels={cards} websites={websites ?? []} />
      </div>
    </>
  );
}
