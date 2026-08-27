import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { getEffectiveBranding } from "@/lib/branding";
import { Palette } from "lucide-react";
import { SettingsSectionHeader } from "@/components/settings/SettingsSectionHeader";
import { BrandCenterForm } from "./BrandCenterForm";

export const dynamic = "force-dynamic";

export default async function BrandCenterPage() {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const supabase = createClient();
  const [{ data: branding }, effectiveBranding] = await Promise.all([
    supabase
      .from("branding")
      .select("display_name, sidebar_logo_url, primary_color, secondary_color, sidebar_bg_color")
      .eq("workspace_id", workspace.id)
      .maybeSingle(),
    getEffectiveBranding(workspace.id),
  ]);

  return (
    <div className="max-w-2xl">
      <SettingsSectionHeader icon={Palette} title="Brand Center" description="Your logo, colors, and nav bar -- how your firm looks across the app and client portal." />

      <div className="mt-6">
        <BrandCenterForm
          workspaceId={workspace.id}
          isOwner={workspace.is_owner}
          isWhitelabeledByEro={effectiveBranding.isWhitelabeledByEro}
          eroName={effectiveBranding.eroName}
          businessName={branding?.display_name ?? null}
          logoUrl={branding?.sidebar_logo_url ?? null}
          primaryColor={branding?.primary_color ?? "#0F172A"}
          secondaryColor={branding?.secondary_color ?? "#2563EB"}
          sidebarBgColor={branding?.sidebar_bg_color ?? null}
        />
      </div>
    </div>
  );
}
