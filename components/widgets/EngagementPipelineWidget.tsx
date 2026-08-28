import { Workflow } from "lucide-react";
import { WidgetShell } from "./WidgetShell";
import { EmptyState } from "./EmptyState";
import type { PipelineStageCount } from "@/lib/dashboard/data";

export function EngagementPipelineWidget({ stages }: { stages: PipelineStageCount[] }) {
  const total = stages.reduce((sum, s) => sum + s.count, 0);

  return (
    <WidgetShell title="Engagement Pipeline" reportHref="/engagements" reportLabel="View Full Pipeline">
      {total === 0 ? (
        <EmptyState icon={Workflow} message="No engagements yet." />
      ) : (
        <div className="-mx-1 flex gap-2 overflow-x-auto pb-1">
          {stages.map((stage) => (
            <div key={stage.status} className="flex min-w-[130px] flex-1 shrink-0 flex-col rounded-xl border border-border bg-surfaceMuted px-3 py-2.5">
              <p className="truncate text-xs font-medium text-muted">{stage.status}</p>
              <p className={`mt-1 font-display text-xl font-semibold tabular-nums ${stage.count > 0 ? "text-ink" : "text-muted"}`}>
                {stage.count > 0 ? stage.count : "-"}
              </p>
            </div>
          ))}
        </div>
      )}
    </WidgetShell>
  );
}
