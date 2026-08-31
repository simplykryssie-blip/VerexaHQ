import { Workflow } from "lucide-react";
import { WidgetShell } from "./WidgetShell";
import { EmptyState } from "./EmptyState";
import type { PipelineStageCount } from "@/lib/dashboard/data";

export function EngagementPipelineWidget({ stages }: { stages: PipelineStageCount[] }) {
  const total = stages.reduce((sum, s) => sum + s.count, 0);
  // The stage with the most engagements sitting in it right now -- a real,
  // computed signal (not decoration) worth calling out since it's usually
  // where work is backing up. Only among non-"Completed" stages, and only
  // when something's actually there, so an all-zero pipeline (or one where
  // everything's just finished) doesn't highlight an arbitrary stage.
  const busiestStatus = stages
    .filter((s) => s.status !== "Completed" && s.count > 0)
    .reduce<PipelineStageCount | null>((max, s) => (!max || s.count > max.count ? s : max), null)?.status;

  return (
    <WidgetShell title="Engagement Pipeline" reportHref="/engagements" reportLabel="View Full Pipeline">
      {total === 0 ? (
        <EmptyState icon={Workflow} message="No engagements yet." />
      ) : (
        <div className="-mx-1 flex gap-2 overflow-x-auto pb-1">
          {stages.map((stage) => {
            const isBusiest = stage.status === busiestStatus;
            return (
              <div
                key={stage.status}
                className={`flex min-w-[130px] flex-1 shrink-0 flex-col rounded-xl border px-3 py-2.5 ${
                  isBusiest ? "border-transparent bg-gradient-to-br from-accent to-brandLime" : "border-border bg-surfaceMuted"
                }`}
              >
                <p className={`truncate text-xs font-medium ${isBusiest ? "text-ink/70" : "text-muted"}`}>{stage.status}</p>
                <p
                  className={`mt-1 font-display text-xl font-semibold tabular-nums ${
                    isBusiest ? "text-ink" : stage.count > 0 ? "text-ink" : "text-muted"
                  }`}
                >
                  {stage.count > 0 ? stage.count : "-"}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </WidgetShell>
  );
}
