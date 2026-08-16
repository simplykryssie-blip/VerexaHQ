import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { StageEditor } from "@/components/settings/StageEditor";
import { TemplateStatusCycle } from "@/components/settings/TemplateStatusCycle";

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

  const [{ data: isWorkspaceAdmin }, { data: stages }, { data: tasks }, { data: stageCounts }] = await Promise.all([
    supabase.rpc("is_workspace_admin", { p_workspace_id: workspace.id }),
    supabase.from("process_stages").select("*").eq("process_id", process.id).order("display_order"),
    supabase
      .from("process_tasks")
      .select("*, process_stages!inner(process_id)")
      .eq("process_stages.process_id", process.id)
      .order("display_order"),
    supabase.from("engagements").select("current_stage").eq("workflow_id", process.id).not("current_stage", "is", null),
  ]);

  const canEdit = !isSystemDefault && Boolean(isWorkspaceAdmin);

  const engagementCountsByStage = new Map<string, number>();
  for (const row of stageCounts ?? []) {
    const key = (row as { current_stage: string }).current_stage;
    engagementCountsByStage.set(key, (engagementCountsByStage.get(key) ?? 0) + 1);
  }

  return (
    <div>
      <Link href="/pipelines" className="mb-4 inline-flex items-center gap-1.5 text-xs font-medium text-muted hover:text-ink">
        <ArrowLeft size={13} /> Back to Pipelines
      </Link>
      <div className="flex items-center gap-2">
        <h2 className="text-base font-semibold text-ink">{process.name}</h2>
        {process.workspace_id ? (
          <TemplateStatusCycle table="processes" id={process.id} status={process.status} />
        ) : (
          <span className="rounded-full bg-surfaceMuted px-2 py-0.5 text-[10px] font-medium text-muted">System</span>
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
        />
      </div>
    </div>
  );
}
