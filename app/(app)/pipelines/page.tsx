import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { PageHeader } from "@/components/PageHeader";
import { clientLabel } from "@/lib/documentEntityLabels";
import { PipelineBoard, type BoardEngagement, type PipelineOption, type StageOption } from "@/components/pipelines/PipelineBoard";

export const dynamic = "force-dynamic";

export default async function PipelinesPage({ searchParams }: { searchParams: { pipeline?: string } }) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const supabase = createClient();

  await supabase.rpc("ensure_default_pipeline", { p_workspace_id: workspace.id });

  const [{ data: pipelines }, { data: canManage }] = await Promise.all([
    supabase
      .from("pipelines")
      .select("id, name, status, pipeline_stages(id, name, display_order, color, is_terminal)")
      .eq("workspace_id", workspace.id)
      .neq("status", "archived")
      .order("created_at"),
    supabase.rpc("is_workspace_admin", { p_workspace_id: workspace.id }),
  ]);

  const pipelineOptions: PipelineOption[] = (pipelines ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    stages: (p.pipeline_stages as unknown as StageOption[])
      .slice()
      .sort((a, b) => a.display_order - b.display_order),
  }));

  const selectedPipeline = pipelineOptions.find((p) => p.id === searchParams.pipeline) ?? pipelineOptions[0] ?? null;

  const { data: engagements } = selectedPipeline
    ? await supabase
        .from("engagements")
        .select("id, engagement_number, priority, due_date, pipeline_stage_id, client_id, clients(first_name, last_name, business_name, client_type)")
        .eq("workspace_id", workspace.id)
        .or(`pipeline_id.eq.${selectedPipeline.id},pipeline_id.is.null`)
        .order("created_at", { ascending: false })
        .limit(500)
    : { data: [] };

  const boardItems: BoardEngagement[] = (engagements ?? []).map((e) => ({
    id: e.id,
    engagement_number: e.engagement_number,
    priority: e.priority,
    due_date: e.due_date,
    pipeline_stage_id: e.pipeline_stage_id,
    clientLabel: clientLabel(e.clients as never),
    clientHref: `/clients/${e.client_id}`,
  }));

  return (
    <>
      <PageHeader
        title="Pipelines"
        description="Your own custom pipelines and stages -- drag engagements through them however your firm actually works."
      />
      <div className="flex-1 px-8 py-6">
        <PipelineBoard
          workspaceId={workspace.id}
          pipelines={pipelineOptions}
          selectedPipelineId={selectedPipeline?.id ?? null}
          engagements={boardItems}
          canManage={Boolean(canManage)}
        />
      </div>
    </>
  );
}
