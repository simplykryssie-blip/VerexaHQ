import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { StageEditor } from "@/components/settings/StageEditor";
import { TemplateStatusCycle } from "@/components/settings/TemplateStatusCycle";
import { PipelineNameEditor } from "@/components/pipelines/PipelineNameEditor";
import { DuplicatePipelineButton } from "@/components/pipelines/DuplicatePipelineButton";

export const dynamic = "force-dynamic";

export default async function PipelineDetailPage({ params }: { params: { id: string } }) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const supabase = createClient();

  const { data: process } = await supabase
    .from("processes")
    .select("id, name, workspace_id, status")
    .eq("id", params.id)
    .maybeSingle();
  if (!process) notFound();

  const isSystemDefault = !process.workspace_id;

  const [{ data: canManagePipelines }, { data: stages }, { data: tasks }, { data: stageCounts }, { data: leadRunSample }] = await Promise.all([
    supabase.rpc("has_permission", { p_workspace_id: workspace.id, p_permission_key: "pipelines.manage" }),
    supabase.from("process_stages").select("*").eq("process_id", process.id).order("display_order"),
    supabase
      .from("process_tasks")
      .select("*, process_stages!inner(process_id)")
      .eq("process_stages.process_id", process.id)
      .order("display_order"),
    supabase.from("engagements").select("current_stage").eq("workflow_id", process.id).not("current_stage", "is", null),
    supabase
      .from("pipeline_runs")
      .select("id")
      .eq("process_id", process.id)
      .eq("workspace_id", workspace.id)
      .eq("entity_type", "client")
      .eq("status", "Active")
      .limit(1),
  ]);

  const canEdit = !isSystemDefault && Boolean(canManagePipelines);
  // No single pipeline is designated "the" lead pipeline anymore -- any
  // pipeline that actually has active leads on it shows them, the same
  // way any pipeline with active engagements shows its engagement count.
  const isLeadPipeline = (leadRunSample ?? []).length > 0;

  const engagementCountsByStage = new Map<string, number>();
  for (const row of stageCounts ?? []) {
    const key = (row as { current_stage: string }).current_stage;
    engagementCountsByStage.set(key, (engagementCountsByStage.get(key) ?? 0) + 1);
  }

  const leadsByStage: Record<string, { clientId: string; name: string }[]> = {};
  if (isLeadPipeline) {
    // entity_id is polymorphic (client or engagement), so there's no FK for
    // PostgREST to embed clients(...) through -- fetch runs, then clients,
    // and join in JS instead.
    const { data: runs } = await supabase
      .from("pipeline_runs")
      .select("entity_id, pipeline_stages!pipeline_runs_current_stage_fkey(process_stage_id)")
      .eq("process_id", process.id)
      .eq("workspace_id", workspace.id)
      .eq("entity_type", "client")
      .eq("status", "Active")
      .not("current_stage_id", "is", null);
    const clientIds = (runs ?? []).map((r) => r.entity_id);
    const { data: leadClients } = clientIds.length > 0
      ? await supabase.from("clients").select("id, first_name, last_name, business_name, client_type").in("id", clientIds)
      : { data: [] as { id: string; first_name: string | null; last_name: string | null; business_name: string | null; client_type: string }[] };
    const clientsById = new Map((leadClients ?? []).map((c) => [c.id, c]));
    for (const r of runs ?? []) {
      const client = clientsById.get(r.entity_id) ?? null;
      const currentStageId = (r.pipeline_stages as unknown as { process_stage_id: string | null } | null)?.process_stage_id;
      if (!client || !currentStageId) continue;
      const name =
        client.client_type === "business" && client.business_name
          ? client.business_name
          : [client.first_name, client.last_name].filter(Boolean).join(" ") || "Unnamed client";
      const list = leadsByStage[currentStageId] ?? [];
      list.push({ clientId: client.id, name });
      leadsByStage[currentStageId] = list;
    }
  }

  return (
    <div>
      <Link href="/pipelines" className="mb-4 inline-flex items-center gap-1.5 text-xs font-medium text-muted hover:text-ink">
        <ArrowLeft size={13} /> Back to Pipelines
      </Link>
      <div className="flex items-center gap-2">
        <PipelineNameEditor processId={process.id} name={process.name} canEdit={canEdit} />
        {process.workspace_id ? (
          <TemplateStatusCycle table="processes" id={process.id} status={process.status} />
        ) : (
          <span className="rounded-full bg-surfaceMuted px-2 py-0.5 text-[10px] font-medium text-muted">System</span>
        )}
        {canManagePipelines && (
          <DuplicatePipelineButton processId={process.id} workspaceId={workspace.id} name={process.name} />
        )}
      </div>

      <div className="mt-8 max-w-3xl">
        <StageEditor
          source={{ kind: "pipeline", processId: process.id }}
          isSystemDefault={isSystemDefault}
          canEdit={canEdit}
          process={{ id: process.id, name: process.name, workspace_id: process.workspace_id }}
          stages={stages ?? []}
          tasks={(tasks ?? []) as never}
          engagementCountsByStage={Object.fromEntries(engagementCountsByStage)}
          isLeadPipeline={isLeadPipeline}
          leadsByStage={leadsByStage}
        />
      </div>
    </div>
  );
}
