"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";

/** Moves a lead through the workspace's default pipeline (real Pipelines,
 * not the old flat lead_stages list). Forward-only, same semantics as the
 * "Move the lead to a pipeline stage" automation action -- selecting a
 * stage starts the pipeline run if none exists yet. */
export function LeadPipelineStageControl({
  clientId,
  lifecycleStatus,
  processId,
  stages,
  currentProcessStageId,
}: {
  clientId: string;
  lifecycleStatus: string;
  processId: string | null;
  stages: { id: string; name: string }[];
  currentProcessStageId: string | null;
}) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (lifecycleStatus !== "lead" || !processId || stages.length === 0) return null;

  async function move(stageId: string) {
    if (!stageId || stageId === currentProcessStageId) return;
    setSaving(true);
    setError(null);
    const { error: rpcError } = await supabase.rpc("advance_lead_pipeline_stage", {
      p_client_id: clientId,
      p_process_id: processId as string,
      p_process_stage_id: stageId,
    });
    setSaving(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    toast.show("Stage updated", "success");
    router.refresh();
  }

  return (
    <div className="flex items-center gap-1.5">
      <select
        value={currentProcessStageId ?? ""}
        onChange={(e) => move(e.target.value)}
        disabled={saving}
        className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-slate focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
      >
        <option value="" disabled>
          Not started
        </option>
        {stages.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
}
