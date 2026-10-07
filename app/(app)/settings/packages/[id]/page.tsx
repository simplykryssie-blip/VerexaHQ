import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { hasCapability } from "@/lib/capabilities";
import { PackageOptionGroupsEditor, type OptionGroupRow } from "@/components/settings/PackageOptionGroupsEditor";
import { PackageEditForm } from "@/components/settings/PackageEditForm";

export const dynamic = "force-dynamic";

// A "package" (software/banking resale) requires the third_party_product_distribution
// capability, but a "digital_product" row in this same table requires
// digital_product_sales instead (see finish_capability_model_products_v1) --
// gated per-row on the fetched product_type instead of redirecting every
// workspace away before even knowing which type this is.
export default async function PackageDetailPage({ params }: { params: { id: string } }) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const supabase = createClient();

  const [{ data: pkg }, { data: canManage }] = await Promise.all([
    supabase
      .from("firm_packages")
      .select(
        "id, name, description, flat_price, billing_cadence, revenue_share_percent, revenue_share_scope, stripe_payment_link_id, stripe_payment_link_url, stripe_price_id, stripe_product_id, purchase_purpose, product_type"
      )
      .eq("id", params.id)
      .eq("workspace_id", workspace.id)
      .maybeSingle(),
    supabase.rpc("is_workspace_admin", { p_workspace_id: workspace.id }),
  ]);

  if (!pkg) notFound();
  const isPackageType = pkg.product_type === "package";
  const requiredCapability = isPackageType ? "third_party_product_distribution" : "digital_product_sales";
  if (!(await hasCapability(supabase, workspace.id, requiredCapability))) redirect("/settings/products");

  const { data: groups } = isPackageType
    ? await supabase
        .from("firm_package_option_groups")
        .select("id, name, min_select, max_select, display_order, firm_package_options(id, label, display_order)")
        .eq("package_id", pkg.id)
        .order("display_order")
    : { data: [] };

  const optionGroups: OptionGroupRow[] = (groups ?? []).map((g) => ({
    id: g.id,
    name: g.name,
    min_select: g.min_select,
    max_select: g.max_select,
    display_order: g.display_order,
    options: ((g.firm_package_options ?? []) as { id: string; label: string; display_order: number }[]).sort(
      (a, b) => a.display_order - b.display_order,
    ),
  }));

  return (
    <div className="max-w-2xl">
      <Link href="/settings/products" className="mb-3 inline-flex items-center gap-1 text-xs font-medium text-muted hover:text-ink">
        <ArrowLeft size={14} aria-hidden="true" /> Back to Products
      </Link>
      <PackageEditForm pkg={pkg} canManage={Boolean(canManage)} />
      {isPackageType && (
        <div className="mt-6">
          <PackageOptionGroupsEditor packageId={pkg.id} groups={optionGroups} />
        </div>
      )}
    </div>
  );
}
