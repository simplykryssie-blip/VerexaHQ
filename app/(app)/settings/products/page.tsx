import { Package } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { isServiceBureauTier, isEroManagementTier } from "@/lib/workspaceCapabilities";
import { SettingsSectionHeader } from "@/components/settings/SettingsSectionHeader";
import { ProductsManager, type ProductRow } from "@/components/settings/ProductsManager";

export const dynamic = "force-dynamic";

// Products is ONE area for every product subtype (Package, Digital
// Product, Service), filtered rather than split into separate top-level
// pages -- see platform_products (the read-side union of firm_packages and
// services) and platform_capability_model_v1 for the schema this draws on.
// Package creation/management stays Service-Bureau-only (third-party
// software/banking resale); Digital Product is available from the ERO
// tier up; Service creation still lives on its own richer page (organizer/
// document/booking setup), linked from here rather than duplicated.
export default async function ProductsPage() {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const supabase = createClient();
  const [{ data: products }, { data: canManage }] = await Promise.all([
    supabase.from("platform_products").select("id, product_type, name, description, price, audience, status").eq("workspace_id", workspace.id),
    supabase.rpc("is_workspace_admin", { p_workspace_id: workspace.id }),
  ]);

  return (
    <div className="max-w-3xl">
      <SettingsSectionHeader
        icon={Package}
        title="Products"
        description="Everything you sell or offer -- packages, digital products, and services -- in one place."
      />
      <div className="mt-6">
        <ProductsManager
          workspaceId={workspace.id}
          products={(products ?? []) as ProductRow[]}
          canManage={Boolean(canManage)}
          canCreatePackage={isServiceBureauTier(workspace)}
          canCreateDigitalProduct={isEroManagementTier(workspace)}
        />
      </div>
    </div>
  );
}
