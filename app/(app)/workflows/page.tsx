import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { PageHeader } from "@/components/PageHeader";
import { WorkflowList, type WorkflowRow } from "@/components/workflows/WorkflowList";
import type { PipelineOption } from "@/components/workflows/TriggerFields";

export const dynamic = "force-dynamic";

export default async function WorkflowsPage() {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const supabase = createClient();

  const [{ data: automations }, { data: canManage }, { data: organizerTemplates }, { data: services }, { data: processes }, { data: folders }, { data: tagRows }] =
    await Promise.all([
      supabase
        .from("automations")
        .select("id, name, slug, description, trigger_type, trigger_config, is_enabled, status, folder_id, automation_steps(id), automation_runs(id)")
        .eq("workspace_id", workspace.id)
        .order("name"),
      supabase.rpc("has_permission", { p_workspace_id: workspace.id, p_permission_key: "automations.manage" }),
      supabase.from("organizer_templates").select("id, name").eq("workspace_id", workspace.id).eq("status", "published").order("name"),
      supabase.from("services").select("id, name").eq("workspace_id", workspace.id).eq("status", "published").order("name"),
      supabase
        .from("processes")
        .select("id, name, process_stages(id, name, display_order)")
        .eq("workspace_id", workspace.id)
        .eq("status", "published")
        .order("name"),
      supabase.from("library_folders").select("id, parent_folder_id, name").eq("workspace_id", workspace.id).eq("item_type", "workflow").order("name"),
      supabase.from("workspace_tags").select("name").eq("workspace_id", workspace.id).order("name"),
    ]);

  const rows: WorkflowRow[] = (automations ?? []).map((a) => ({
    id: a.id,
    name: a.name,
    description: a.description,
    trigger_type: a.trigger_type,
    trigger_config: a.trigger_config as Record<string, unknown>,
    is_enabled: a.is_enabled,
    status: a.status,
    folder_id: a.folder_id,
    step_count: (a.automation_steps as unknown as { id: string }[]).length,
    run_count: (a.automation_runs as unknown as { id: string }[]).length,
  }));

  const pipelines: PipelineOption[] = (processes ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    stages: (p.process_stages as unknown as { id: string; name: string; display_order: number }[])
      .slice()
      .sort((a, b) => a.display_order - b.display_order)
      .map((s) => ({ id: s.id, name: s.name })),
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
          folders={folders ?? []}
          canManage={Boolean(canManage)}
          organizerTemplates={organizerTemplates ?? []}
          services={services ?? []}
          pipelines={pipelines}
          tagOptions={(tagRows ?? []).map((t) => t.name)}
        />
      </div>
    </>
  );
}
