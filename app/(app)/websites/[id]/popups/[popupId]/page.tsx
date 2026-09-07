import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { PopupBuilder } from "@/components/websites/PopupBuilder";

export const dynamic = "force-dynamic";

export default async function PopupBuilderRoute({ params }: { params: { id: string; popupId: string } }) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const supabase = createClient();
  const [{ data: popup }, { data: sections }, { data: pages }, { data: canManage }, { data: organizerTemplates }] = await Promise.all([
    supabase
      .from("site_popups")
      .select(
        "id, workspace_id, website_id, name, status, trigger_type, trigger_value, display_frequency, frequency_days, target_page_ids, background_color, custom_css"
      )
      .eq("id", params.popupId)
      .maybeSingle(),
    supabase.from("site_popup_sections").select("id, section_type, display_order, config").eq("popup_id", params.popupId).order("display_order"),
    supabase.from("site_pages").select("id, title").eq("website_id", params.id).order("title"),
    supabase.rpc("has_permission", { p_workspace_id: workspace.id, p_permission_key: "site_pages.manage" }),
    supabase.from("organizer_templates").select("id, name, is_public, public_token").eq("workspace_id", workspace.id).eq("status", "published").order("name"),
  ]);

  if (!popup || popup.workspace_id !== workspace.id || popup.website_id !== params.id) notFound();

  return (
    <PopupBuilder
      websiteId={params.id}
      popup={popup as never}
      initialSections={(sections ?? []) as never}
      pageOptions={pages ?? []}
      canManage={Boolean(canManage)}
      organizerTemplates={organizerTemplates ?? []}
    />
  );
}
