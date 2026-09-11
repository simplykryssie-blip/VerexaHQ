import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { ServicesPageClient } from "@/components/settings/ServicesPageClient";
import type { ServiceCard, ServiceCategoryOption } from "@/components/settings/ServiceLibrary";

export const dynamic = "force-dynamic";

export default async function ServicesPage() {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const supabase = createClient();

  const [{ data: services }, { data: categories }, { data: canManage }] = await Promise.all([
    supabase
      .from("services")
      .select("id, name, status, service_categories(name), processes(name)")
      .eq("workspace_id", workspace.id)
      .order("name"),
    supabase.from("service_categories").select("id, name").eq("workspace_id", workspace.id).order("display_order"),
    supabase.rpc("is_workspace_admin", { p_workspace_id: workspace.id }),
  ]);

  const cards: ServiceCard[] = (services ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    status: s.status,
    category_name: (s.service_categories as unknown as { name: string } | null)?.name ?? null,
    pipeline_name: (s.processes as unknown as { name: string } | null)?.name ?? null,
  }));

  const categoryOptions: ServiceCategoryOption[] = categories ?? [];

  return (
    <ServicesPageClient
      workspaceId={workspace.id}
      workspaceSlug={workspace.slug}
      services={cards}
      categories={categoryOptions}
      canManage={Boolean(canManage)}
    />
  );
}
