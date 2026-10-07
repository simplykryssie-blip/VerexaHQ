import { redirect } from "next/navigation";
import { Package } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { hasCapability } from "@/lib/capabilities";
import { SettingsSectionHeader } from "@/components/settings/SettingsSectionHeader";
import { PackagesManager, type PackageRow } from "@/components/settings/PackagesManager";

export const dynamic = "force-dynamic";

// Packages are what a Service Bureau sells to the EROs/PTINs connected to
// it -- a priced software/banking bundle. Gated on the third_party_product_distribution
// capability (Service Bureau tier by default, same check the underlying
// firm_packages RLS enforces) rather than the tier directly, so a platform
// override is reflected here too.
export default async function PackagesPage() {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const supabase = createClient();
  if (!(await hasCapability(supabase, workspace.id, "third_party_product_distribution"))) redirect("/settings/products");

  const [{ data: packages }, { data: canManage }] = await Promise.all([
    supabase
      .from("firm_packages")
      .select("id, name, description, status, flat_price, billing_cadence, revenue_share_percent, revenue_share_scope")
      .eq("workspace_id", workspace.id)
      .eq("product_type", "package")
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
