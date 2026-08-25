import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { PageHeader } from "@/components/PageHeader";
import { WebsiteDetail } from "@/components/websites/WebsiteDetail";

export const dynamic = "force-dynamic";

export default async function WebsiteDetailRoute({ params }: { params: { id: string } }) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const supabase = createClient();
  const [{ data: website }, { data: pages }, { data: canManage }] = await Promise.all([
    supabase
      .from("site_websites")
      .select("id, workspace_id, name, slug, favicon_url, head_tracking_code, body_tracking_code, custom_domain, domain_verified, domain_verified_at")
      .eq("id", params.id)
      .maybeSingle(),
    supabase.from("site_pages").select("id, title, slug, status").eq("website_id", params.id).order("created_at", { ascending: false }),
    supabase.rpc("has_permission", { p_workspace_id: workspace.id, p_permission_key: "site_pages.manage" }),
  ]);

  if (!website || website.workspace_id !== workspace.id) notFound();

  return (
    <>
      <PageHeader title={website.name} backHref="/websites" backLabel="Websites" />
      <div className="flex-1 px-8 py-6">
        <WebsiteDetail workspaceSlug={workspace.slug} website={website} pages={pages ?? []} canManage={Boolean(canManage)} />
      </div>
    </>
  );
}
