import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { PageHeader } from "@/components/PageHeader";
import { FunnelManager } from "@/components/pages/FunnelManager";

export const dynamic = "force-dynamic";

export default async function FunnelManagerRoute({ params }: { params: { id: string } }) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const supabase = createClient();
  const [{ data: funnel }, { data: memberPages }, { data: availablePages }, { data: canManage }] = await Promise.all([
    supabase.from("site_funnels").select("id, workspace_id, name, status").eq("id", params.id).maybeSingle(),
    supabase
      .from("site_pages")
      .select("id, title, slug, status, funnel_position")
      .eq("funnel_id", params.id)
      .order("funnel_position", { ascending: true }),
    supabase.from("site_pages").select("id, title, slug").eq("workspace_id", workspace.id).is("funnel_id", null).order("title"),
    supabase.rpc("has_permission", { p_workspace_id: workspace.id, p_permission_key: "site_pages.manage" }),
  ]);

  if (!funnel || funnel.workspace_id !== workspace.id) notFound();

  return (
    <>
      <PageHeader title={funnel.name} backHref="/pages/funnels" backLabel="Funnels" />
      <div className="flex-1 px-8 py-6">
        <FunnelManager
          funnel={funnel}
          memberPages={memberPages ?? []}
          availablePages={availablePages ?? []}
          canManage={Boolean(canManage)}
        />
      </div>
    </>
  );
}
