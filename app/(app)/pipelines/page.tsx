import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { PageHeader } from "@/components/PageHeader";
import { PipelineLibrary, type PipelineCard } from "@/components/pipelines/PipelineLibrary";

export const dynamic = "force-dynamic";

export default async function PipelinesPage() {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const supabase = createClient();

  const { data: processes } = await supabase
    .from("processes")
    .select("id, name, status, workspace_id, process_stages(id)")
    .eq("workspace_id", workspace.id)
    .order("name");

  const pipelines: PipelineCard[] = (processes ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    status: p.status,
    workspace_id: p.workspace_id,
    stage_count: (p.process_stages as unknown as { id: string }[]).length,
  }));

  return (
    <>
      <PageHeader
        title="Pipelines"
        description="The stages work moves through, with the right form, document checklist, or engagement letter attached where each one is needed."
      />
      <div className="flex-1 px-8 py-6">
        <PipelineLibrary workspaceId={workspace.id} pipelines={pipelines} />
      </div>
    </>
  );
}
