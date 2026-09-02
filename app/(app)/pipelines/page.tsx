import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { PipelinesPageClient } from "@/components/pipelines/PipelinesPageClient";
import type { PipelineCard } from "@/components/pipelines/PipelineLibrary";

export const dynamic = "force-dynamic";

export default async function PipelinesPage() {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const supabase = createClient();

  const [{ data: processes }, { data: canManage }, { data: folders }] = await Promise.all([
    supabase
      .from("processes")
      .select("id, name, status, workspace_id, folder_id, process_stages(id)")
      .eq("workspace_id", workspace.id)
      .order("name"),
    supabase.rpc("has_permission", { p_workspace_id: workspace.id, p_permission_key: "pipelines.manage" }),
    supabase.from("library_folders").select("id, parent_folder_id, name").eq("workspace_id", workspace.id).eq("item_type", "pipeline").order("name"),
  ]);

  const pipelines: PipelineCard[] = (processes ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    status: p.status,
    workspace_id: p.workspace_id,
    folder_id: p.folder_id,
    stage_count: (p.process_stages as unknown as { id: string }[]).length,
  }));

  return (
    <PipelinesPageClient workspaceId={workspace.id} pipelines={pipelines} folders={folders ?? []} canManage={Boolean(canManage)} />
  );
}
