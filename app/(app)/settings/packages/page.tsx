import { redirect } from "next/navigation";
import { Package } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { isServiceBureauTier } from "@/lib/workspaceCapabilities";
import { SettingsSectionHeader } from "@/components/settings/SettingsSectionHeader";
import { PackagesManager, type PackageRow } from "@/components/settings/PackagesManager";
import { PartnerPurchaseWebhookCard, type PartnerPurchaseWebhookStatus } from "@/components/settings/PartnerPurchaseWebhookCard";

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
  const [{ data: packages }, { data: canManage }, { data: webhookStatus }] = await Promise.all([
    supabase
      .from("firm_packages")
      .select("id, name, description, status, flat_price, billing_cadence, revenue_share_percent, revenue_share_scope")
      .eq("workspace_id", workspace.id)
      .order("created_at"),
    supabase.rpc("is_workspace_admin", { p_workspace_id: workspace.id }),
    supabase.rpc("get_partner_purchase_webhook_status", { p_workspace_id: workspace.id }).maybeSingle(),
  ]);

  return (
    <div className="max-w-3xl">
      <SettingsSectionHeader
        icon={Package}
        title="Packages"
        description="Partnership tiers you offer to firms connected to you -- a flat price, a revenue-share cut on their production, or both."
      />
      <div className="mt-6 space-y-4">
        <PartnerPurchaseWebhookCard
          workspaceId={workspace.id}
          canManage={Boolean(canManage)}
          status={(webhookStatus as PartnerPurchaseWebhookStatus | null) ?? { configured: false, endpoint_token: null, has_secret: false, rotated_at: null }}
        />
        <PackagesManager workspaceId={workspace.id} packages={(packages ?? []) as PackageRow[]} canManage={Boolean(canManage)} />
      </div>
    </div>
  );
}
