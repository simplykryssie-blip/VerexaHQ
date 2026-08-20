"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";

type StageOption = { id: string; name: string; display_order: number };
type LeadCard = { clientId: string; name: string; currentStageId: string };

// Lives here instead of on the client page -- moving a lead through stages
// is a pipeline-wide operation (see it next to every other lead in the same
// stage), not something that belongs buried in one contact's toolbar.
// Forward-only, same RPC and semantics the old per-client control used.
export function LeadPipelineBoard({
  processId,
  stages,
  leads,
}: {
  processId: string;
  stages: StageOption[];
  leads: LeadCard[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [savingId, setSavingId] = useState<string | null>(null);

  const sortedStages = [...stages].sort((a, b) => a.display_order - b.display_order);
  const leadsByStage = new Map<string, LeadCard[]>();
  for (const lead of leads) {
    const list = leadsByStage.get(lead.currentStageId) ?? [];
    list.push(lead);
    leadsByStage.set(lead.currentStageId, list);
  }

  async function move(clientId: string, stageId: string) {
    setSavingId(clientId);
    const { error } = await supabase.rpc("advance_lead_pipeline_stage", {
      p_client_id: clientId,
      p_process_id: processId,
      p_process_stage_id: stageId,
    });
    setSavingId(null);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    toast.show("Stage updated", "success");
    router.refresh();
  }

  if (leads.length === 0) {
    return <p className="text-sm text-muted">No leads are currently in this pipeline.</p>;
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {sortedStages.map((stage) => {
        const cards = leadsByStage.get(stage.id) ?? [];
        return (
          <div key={stage.id} className="w-64 shrink-0 rounded-2xl border border-border bg-surfaceMuted p-3">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{stage.name}</h3>
              <span className="text-xs text-muted">{cards.length}</span>
            </div>
            <div className="space-y-2">
              {cards.map((lead) => (
                <div key={lead.clientId} className="rounded-xl border border-border bg-surface p-2.5 shadow-soft">
                  <Link href={`/clients/${lead.clientId}`} className="text-sm font-medium text-accent hover:underline">
                    {lead.name}
                  </Link>
                  <select
                    value={lead.currentStageId}
                    onChange={(e) => move(lead.clientId, e.target.value)}
                    disabled={savingId === lead.clientId}
                    className="mt-2 w-full rounded-lg border border-border px-2 py-1 text-xs text-slate focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
                  >
                    {sortedStages.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
              {cards.length === 0 && <p className="text-xs text-muted">Empty</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
