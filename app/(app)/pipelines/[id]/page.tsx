import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { StageEditor } from "@/components/settings/StageEditor";
import { TemplateStatusCycle } from "@/components/settings/TemplateStatusCycle";
import { PipelineNameEditor } from "@/components/pipelines/PipelineNameEditor";
import { LeadPipelineBoard } from "@/components/pipelines/LeadPipelineBoard";

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

  const [{ data: isWorkspaceAdmin }, { data: stages }, { data: tasks }, { data: stageCounts }, { data: workspaceRow }] = await Promise.all([
    supabase.rpc("is_workspace_admin", { p_workspace_id: workspace.id }),
    supabase.from("process_stages").select("*").eq("process_id", process.id).order("display_order"),
    supabase
      .from("process_tasks")
      .select("*, process_stages!inner(process_id)")
      .eq("process_stages.process_id", process.id)
      .order("display_order"),
    supabase.from("engagements").select("current_stage").eq("workflow_id", process.id).not("current_stage", "is", null),
    supabase.from("workspaces").select("default_lead_process_id").eq("id", workspace.id).maybeSingle(),
  ]);

  const canEdit = !isSystemDefault && Boolean(isWorkspaceAdmin);
  const isDefaultLeadPipeline = workspaceRow?.default_lead_process_id === process.id;

  const engagementCountsByStage = new Map<string, number>();
  for (const row of stageCounts ?? []) {
    const key = (row as { current_stage: string }).current_stage;
    engagementCountsByStage.set(key, (engagementCountsByStage.get(key) ?? 0) + 1);
  }

  let leadCards: { clientId: string; name: string; currentStageId: string }[] = [];
  if (isDefaultLeadPipeline) {
    const { data: runs } = await supabase
      .from("lead_pipeline_runs")
      .select(
        "lead_pipeline_stages!lead_pipeline_runs_current_stage_fkey(process_stage_id), clients(id, first_name, last_name, business_name, client_type)"
      )
      .eq("process_id", process.id)
      .eq("workspace_id", workspace.id)
      .eq("status", "Active")
      .not("current_stage_id", "is", null);
    leadCards = (runs ?? [])
      .map((r) => {
        const client = r.clients as unknown as {
          id: string;
          first_name: string | null;
          last_name: string | null;
          business_name: string | null;
          client_type: string;
        } | null;
        const currentStageId = (r.lead_pipeline_stages as unknown as { process_stage_id: string | null } | null)?.process_stage_id;
        if (!client || !currentStageId) return null;
        const name =
          client.client_type === "business" && client.business_name
            ? client.business_name
            : [client.first_name, client.last_name].filter(Boolean).join(" ") || "Unnamed client";
        return { clientId: client.id, name, currentStageId };
      })
      .filter((c): c is { clientId: string; name: string; currentStageId: string } => c !== null);
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
      </div>

      {isDefaultLeadPipeline && (
        <div className="mt-8">
          <h2 className="text-sm font-semibold text-ink">Leads in this pipeline</h2>
          <p className="mt-1 text-xs text-muted">Move a lead to a new stage from here -- this is the default pipeline for new leads.</p>
          <div className="mt-3">
            <LeadPipelineBoard processId={process.id} stages={stages ?? []} leads={leadCards} />
          </div>
        </div>
      )}

      <div className="mt-8 max-w-3xl">
        <StageEditor
          source={{ kind: "pipeline", processId: process.id }}
          isSystemDefault={isSystemDefault}
          canEdit={canEdit}
          process={{ id: process.id, name: process.name, workspace_id: process.workspace_id }}
          stages={stages ?? []}
          tasks={(tasks ?? []) as never}
          engagementCountsByStage={Object.fromEntries(engagementCountsByStage)}
        />
      </div>
    </div>
  );
}
