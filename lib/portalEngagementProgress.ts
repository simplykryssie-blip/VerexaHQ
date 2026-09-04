import { createClient } from "@/lib/supabase/server";

export type EngagementProgress = {
  stageName: string | null;
  percent: number | null;
  isCompleted: boolean;
};

// engagements.status is legacy plumbing -- it only ever changes once, when
// the entire pipeline_run finishes (see log_engagement_completed_on_invoice_paid's
// sibling, advance_pipeline_on_stage_completed's else-branch), so it sits at
// its default 'New' for the entire life of an engagement and then jumps
// straight to 'Completed'. The real, live progress -- what actually moves as
// stages advance, and what the staff Kanban and automations already key off
// -- lives in pipeline_runs/pipeline_stages. This resolves that instead, so
// the client portal shows the client's real current stage rather than a
// dead field that never reflects mid-engagement progress.
export async function getEngagementProgressMap(engagementIds: string[]): Promise<Map<string, EngagementProgress>> {
  const map = new Map<string, EngagementProgress>();
  if (engagementIds.length === 0) return map;

  const supabase = createClient();
  const { data: runs } = await supabase
    .from("pipeline_runs")
    .select("id, entity_id, status, current_stage_id, started_at")
    .eq("entity_type", "engagement")
    .in("entity_id", engagementIds)
    .order("started_at", { ascending: false });

  // An engagement can only ever have one live pipeline_run in practice, but
  // guard against duplicates the same way v_engagement_progress does: prefer
  // the Active one, otherwise the most recently started.
  const runByEngagement = new Map<string, { id: string; status: string; current_stage_id: string | null }>();
  for (const r of runs ?? []) {
    const existing = runByEngagement.get(r.entity_id);
    if (!existing || (r.status === "Active" && existing.status !== "Active")) {
      runByEngagement.set(r.entity_id, r);
    }
  }

  const runIds = Array.from(runByEngagement.values()).map((r) => r.id);
  if (runIds.length === 0) return map;

  const { data: stages } = await supabase
    .from("pipeline_stages")
    .select("id, pipeline_run_id, stage_name, status")
    .in("pipeline_run_id", runIds);

  for (const [engagementId, run] of runByEngagement) {
    const runStages = (stages ?? []).filter((s) => s.pipeline_run_id === run.id);
    const totalStages = runStages.length;
    const doneStages = runStages.filter((s) => s.status === "Completed" || s.status === "Skipped").length;
    const currentStage = runStages.find((s) => s.id === run.current_stage_id);
    const isCompleted = run.status === "Completed";
    map.set(engagementId, {
      stageName: isCompleted ? "Completed" : (currentStage?.stage_name ?? null),
      percent: isCompleted ? 100 : totalStages > 0 ? Math.round((doneStages / totalStages) * 100) : null,
      isCompleted,
    });
  }

  return map;
}
