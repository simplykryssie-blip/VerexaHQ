import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { Palette } from "lucide-react";
import { SettingsSectionHeader } from "@/components/settings/SettingsSectionHeader";
import { getEffectiveBranding } from "@/lib/branding";
import { BrandCenterForm } from "@/components/settings/BrandCenterForm";

export const dynamic = "force-dynamic";

export default async function BrandCenterPage() {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const supabase = createClient();
  const [{ data: branding }, effectiveBranding, { data: isPlatformAdmin }, { data: workspaceRow }] = await Promise.all([
    supabase
      .from("branding")
      .select(
        "display_name, logo_url, favicon_url, sidebar_logo_url, portal_logo_url, primary_color, secondary_color, sidebar_bg_color, sidebar_text_color, document_footer_text"
      )
      .eq("workspace_id", workspace.id)
      .maybeSingle(),
    getEffectiveBranding(workspace.id),
    supabase.rpc("is_platform_admin"),
    supabase.from("workspaces").select("is_demo").eq("id", workspace.id).single(),
  ]);

  // Demo workspaces are each owned by their own fake persona (Monica Jones,
  // Jade Monroe, ...) so the demo's real day-to-day account -- a platform
  // admin, not that persona -- is only ever an Admin there and would
  // otherwise see every branding control correctly disabled by the
  // owner-only check below. Platform admins get a bypass, scoped to demo
  // workspaces only so this never loosens who can edit a real firm's
  // branding.
  const platformAdminOverride = Boolean(isPlatformAdmin) && Boolean(workspaceRow?.is_demo);

  return (
    <div className="max-w-2xl">
      <SettingsSectionHeader
        icon={Palette}
        title="Branding"
        description="Your logo and colors -- shown on your staff dashboard and everything your clients see, from the portal to your public forms."
      />

      <div className="mt-6">
        <BrandCenterForm
          workspaceId={workspace.id}
          workspaceName={workspace.name}
          businessName={branding?.display_name ?? null}
          logoUrl={branding?.logo_url ?? null}
          faviconUrl={branding?.favicon_url ?? null}
          sidebarLogoUrl={branding?.sidebar_logo_url ?? null}
          portalLogoUrl={branding?.portal_logo_url ?? null}
          primaryColor={branding?.primary_color ?? "#0F172A"}
          secondaryColor={branding?.secondary_color ?? "#2563EB"}
          sidebarBgColor={branding?.sidebar_bg_color ?? null}
          sidebarTextColor={branding?.sidebar_text_color ?? null}
          documentFooterText={branding?.document_footer_text ?? null}
          isOwner={workspace.is_owner}
          isWhitelabeledByEro={effectiveBranding.isWhitelabeledByEro}
          allowsBrandingOverride={effectiveBranding.allowsBrandingOverride}
          eroName={effectiveBranding.eroName ?? null}
          platformAdminOverride={platformAdminOverride}
        />
      </div>
    </div>
  );
}
