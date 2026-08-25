import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { SettingsSectionHeader } from "@/components/settings/SettingsSectionHeader";
import { ServiceLibrary, type ServiceCard, type ServiceCategoryOption } from "@/components/settings/ServiceLibrary";
import { Package } from "lucide-react";

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
    <div className="max-w-4xl">
      <SettingsSectionHeader
        icon={Package}
        title="Services"
        description="What your firm offers -- each service can attach a pipeline, an organizer, and the requirements an engagement of that type needs before it can be released."
      />
      <div className="mt-4">
        <ServiceLibrary workspaceId={workspace.id} services={cards} categories={categoryOptions} canManage={Boolean(canManage)} />
      </div>
    </div>
  );
}
