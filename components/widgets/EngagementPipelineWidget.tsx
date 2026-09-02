import { Workflow } from "lucide-react";
import { WidgetShell } from "./WidgetShell";
import { EmptyState } from "./EmptyState";
import { ProgressBar } from "@/components/ui/ProgressBar";
import type { PipelineStageCount } from "@/lib/dashboard/data";

export function EngagementPipelineWidget({ stages }: { stages: PipelineStageCount[] }) {
  const total = stages.reduce((sum, s) => sum + s.count, 0);
  const max = Math.max(...stages.map((s) => s.count), 1);
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
        <ul className="space-y-2">
          {stages.map((stage) => (
            <li key={stage.status} className="flex items-center gap-3">
              <span className="w-40 shrink-0 truncate text-xs font-medium text-muted">{stage.status}</span>
              <ProgressBar percent={(stage.count / max) * 100} tone={stage.status === busiestStatus ? "gradient" : "accent"} size="sm" />
              <span className="w-6 shrink-0 text-right text-xs font-semibold tabular-nums text-ink">{stage.count || "-"}</span>
            </li>
          ))}
        </ul>
      )}
    </WidgetShell>
  );
}
