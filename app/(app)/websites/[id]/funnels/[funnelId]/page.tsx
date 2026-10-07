import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { PageHeader } from "@/components/PageHeader";
import { FunnelManager } from "@/components/websites/FunnelManager";
import { getLiveUrl } from "@/lib/websites/liveUrl";

export const dynamic = "force-dynamic";

export default async function FunnelManagerRoute({ params }: { params: { id: string; funnelId: string } }) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const supabase = createClient();
  const [{ data: funnel }, { data: website }, { data: memberPages }, { data: availablePages }, { data: canManage }] = await Promise.all([
    supabase.from("site_funnels").select("id, workspace_id, website_id, name, status").eq("id", params.funnelId).maybeSingle(),
    supabase.from("site_websites").select("id, workspace_id, slug, custom_domain, domain_verified").eq("id", params.id).maybeSingle(),
    supabase
      .from("site_pages")
      .select("id, title, slug, status, funnel_position")
      .eq("funnel_id", params.funnelId)
      .order("funnel_position", { ascending: true }),
    supabase.from("site_pages").select("id, title, slug").eq("website_id", params.id).is("funnel_id", null).order("title"),
    supabase.rpc("has_permission", { p_workspace_id: workspace.id, p_permission_key: "site_pages.manage" }),
  ]);

  if (!funnel || !website || funnel.workspace_id !== workspace.id || funnel.website_id !== params.id || website.workspace_id !== workspace.id) notFound();

  return (
    <>
      <PageHeader title={funnel.name} backHref={`/websites/${params.id}/funnels`} backLabel="Funnels" />
      <div className="flex-1 px-8 py-6">
        <FunnelManager
          funnel={funnel}
          memberPages={memberPages ?? []}
          availablePages={availablePages ?? []}
          canManage={Boolean(canManage)}
          liveUrl={(() => {
            const firstPublished = (memberPages ?? []).find((p) => p.status === "published");
            return firstPublished
              ? getLiveUrl({
                  pageSlug: firstPublished.slug,
                  workspaceSlug: workspace.slug,
                  websiteSlug: website.slug,
                  customDomain: website.custom_domain,
                  domainVerified: Boolean(website.domain_verified),
                })
              : null;
          })()}
        />
      </div>
    </>
  );
}
