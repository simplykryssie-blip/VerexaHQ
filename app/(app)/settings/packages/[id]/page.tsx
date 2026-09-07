import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { PackageOptionGroupsEditor, type OptionGroupRow } from "@/components/settings/PackageOptionGroupsEditor";

export const dynamic = "force-dynamic";

export default async function PackageDetailPage({ params }: { params: { id: string } }) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const supabase = createClient();

  const { data: pkg } = await supabase
    .from("firm_packages")
    .select("id, name, description, flat_price, billing_cadence")
    .eq("id", params.id)
    .eq("workspace_id", workspace.id)
    .maybeSingle();

  if (!pkg) notFound();

  const { data: groups } = await supabase
    .from("firm_package_option_groups")
    .select("id, name, min_select, max_select, display_order, firm_package_options(id, label, display_order)")
    .eq("package_id", pkg.id)
    .order("display_order");

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
      <Link href="/settings/packages" className="mb-3 inline-flex items-center gap-1 text-xs font-medium text-muted hover:text-ink">
        <ArrowLeft size={14} aria-hidden="true" /> Back to Packages
      </Link>
      <h1 className="font-display text-lg font-semibold text-ink">{pkg.name}</h1>
      {pkg.description && <p className="mt-1 text-sm text-muted">{pkg.description}</p>}
      <div className="mt-6">
        <PackageOptionGroupsEditor packageId={pkg.id} groups={optionGroups} />
      </div>
    </div>
  );
}
