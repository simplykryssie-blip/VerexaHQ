import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { PageHeader } from "@/components/PageHeader";
import { FunnelLibrary, type FunnelCard } from "@/components/websites/FunnelLibrary";

export const dynamic = "force-dynamic";

export default async function WebsiteFunnelsPage({ params }: { params: { id: string } }) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const supabase = createClient();
  const [{ data: website }, { data: funnels }, { data: canManage }] = await Promise.all([
    supabase.from("site_websites").select("id, workspace_id, name").eq("id", params.id).maybeSingle(),
    supabase
      .from("site_funnels")
      .select("id, name, status, site_pages(id)")
      .eq("website_id", params.id)
      .order("created_at", { ascending: false }),
    supabase.rpc("has_permission", { p_workspace_id: workspace.id, p_permission_key: "site_pages.manage" }),
  ]);

  if (!website || website.workspace_id !== workspace.id) notFound();

  const cards: FunnelCard[] = (funnels ?? []).map((f) => ({
    id: f.id,
    name: f.name,
    status: f.status,
    page_count: (f.site_pages as unknown as { id: string }[]).length,
  }));

  return (
    <>
      <PageHeader
        title="Funnels"
        backHref={`/websites/${params.id}`}
        backLabel={website.name}
        description="Chain pages together into a linear sequence, e.g. landing -> application -> thank-you."
      />
      <div className="flex-1 px-8 py-6">
        <FunnelLibrary workspaceId={workspace.id} websiteId={params.id} funnels={cards} canManage={Boolean(canManage)} />
      </div>
    </>
  );
}
