import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { Workflow } from "lucide-react";
import { SettingsSectionHeader } from "@/components/settings/SettingsSectionHeader";
import { ServiceToggleList } from "@/components/settings/ServiceToggleList";

export const dynamic = "force-dynamic";

export default async function ServicesPage() {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const supabase = createClient();

  const [{ data: fixedServices }, { data: ownedServices }] = await Promise.all([
    supabase.from("services").select("id, name, description").is("workspace_id", null).order("name"),
    supabase.from("services").select("id, name, status, cloned_from_service_id").eq("workspace_id", workspace.id).order("name"),
  ]);

  return (
    <div className="max-w-3xl">
      <SettingsSectionHeader
        icon={Workflow}
        title="Services"
        description="A service is a type of work your firm offers, not a specific client's work -- turn on the ones you do here, each with its own editable pipeline. When you start that work for an actual client, you open an engagement for it."
      />

      <div className="mt-6">
        <ServiceToggleList
          workspaceId={workspace.id}
          fixedServices={fixedServices ?? []}
          ownedServices={ownedServices ?? []}
          templateServiceId={fixedServices?.[0]?.id ?? null}
        />
      </div>
    </div>
  );
}
