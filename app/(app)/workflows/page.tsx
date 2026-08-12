import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { PageHeader } from "@/components/PageHeader";
import { WorkflowList, type WorkflowRow } from "@/components/workflows/WorkflowList";

export const dynamic = "force-dynamic";

export default async function WorkflowsPage() {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const supabase = createClient();

  const [{ data: automations }, { data: canManage }, { data: organizerTemplates }, { data: services }] = await Promise.all([
    supabase
      .from("automations")
      .select("id, name, slug, description, trigger_type, trigger_config, is_enabled, status, created_at, automation_steps(id), automation_runs(id)")
      .eq("workspace_id", workspace.id)
      .order("created_at", { ascending: false }),
    supabase.rpc("is_workspace_admin", { p_workspace_id: workspace.id }),
    supabase
      .from("organizer_templates")
      .select("id, name")
      .or(`workspace_id.is.null,workspace_id.eq.${workspace.id}`)
      .eq("status", "published")
      .order("name"),
    supabase
      .from("services")
      .select("id, name")
      .or(`workspace_id.is.null,workspace_id.eq.${workspace.id}`)
      .eq("status", "published")
      .order("name"),
  ]);

  const rows: WorkflowRow[] = (automations ?? []).map((a) => ({
    id: a.id,
    name: a.name,
    description: a.description,
    trigger_type: a.trigger_type,
    trigger_config: a.trigger_config as Record<string, unknown>,
    is_enabled: a.is_enabled,
    status: a.status,
    step_count: (a.automation_steps as unknown as { id: string }[]).length,
    run_count: (a.automation_runs as unknown as { id: string }[]).length,
  }));

  return (
    <>
      <PageHeader
        title="Workflows"
        description="Automate what happens when something changes on an engagement -- send an email or text, create a task, after a status change."
      />
      <div className="flex-1 px-8 py-6">
        <WorkflowList
          workspaceId={workspace.id}
          workflows={rows}
          canManage={Boolean(canManage)}
          organizerTemplates={organizerTemplates ?? []}
          services={services ?? []}
        />
      </div>
    </>
  );
}
