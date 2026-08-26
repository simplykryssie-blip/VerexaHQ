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
  const [{ data: branding }, effectiveBranding] = await Promise.all([
    supabase
      .from("branding")
      .select("display_name, sidebar_logo_url, portal_logo_url, primary_color, secondary_color, sidebar_bg_color, sidebar_text_color")
      .eq("workspace_id", workspace.id)
      .maybeSingle(),
    getEffectiveBranding(workspace.id),
  ]);

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
          sidebarLogoUrl={branding?.sidebar_logo_url ?? null}
          portalLogoUrl={branding?.portal_logo_url ?? null}
          primaryColor={branding?.primary_color ?? "#0F172A"}
          secondaryColor={branding?.secondary_color ?? "#2563EB"}
          sidebarBgColor={branding?.sidebar_bg_color ?? null}
          sidebarTextColor={branding?.sidebar_text_color ?? null}
          isOwner={workspace.is_owner}
          isWhitelabeledByEro={effectiveBranding.isWhitelabeledByEro}
          allowsBrandingOverride={effectiveBranding.allowsBrandingOverride}
          eroName={effectiveBranding.eroName ?? null}
        />
      </div>
    </div>
  );
}
