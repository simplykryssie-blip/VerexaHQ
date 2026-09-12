import { redirect } from "next/navigation";
import { Package } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { isServiceBureauTier } from "@/lib/workspaceCapabilities";
import { SettingsSectionHeader } from "@/components/settings/SettingsSectionHeader";
import { PackagesManager, type PackageRow } from "@/components/settings/PackagesManager";

export const dynamic = "force-dynamic";

// Packages are what a Service Bureau sells to the EROs/PTINs connected to
// it -- a priced software/banking bundle. An ERO or multi-office firm still
// manages its own connected PTINs, but never resells a package, so this is
// gated on the narrower Service Bureau tier, not the general
// isEroManagementTier set.
export default async function PackagesPage() {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;
  if (!isServiceBureauTier(workspace)) redirect("/settings/services");

  const supabase = createClient();
  const [{ data: packages }, { data: canManage }] = await Promise.all([
    supabase
      .from("firm_packages")
      .select("id, name, description, status, flat_price, billing_cadence, revenue_share_percent, revenue_share_scope")
      .eq("workspace_id", workspace.id)
      .order("created_at"),
    supabase.rpc("is_workspace_admin", { p_workspace_id: workspace.id }),
  ]);

  return (
    <div className="max-w-3xl">
      <SettingsSectionHeader
        icon={Package}
        title="Packages"
        description="Partnership tiers you offer to firms connected to you -- a flat price, a revenue-share cut on their production, or both."
      />
      <div className="mt-6">
        <PackagesManager workspaceId={workspace.id} packages={(packages ?? []) as PackageRow[]} canManage={Boolean(canManage)} />
      </div>
    </div>
  );
}
