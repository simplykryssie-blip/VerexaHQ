import { Workflow } from "lucide-react";
import { WidgetShell } from "./WidgetShell";
import { EmptyState } from "./EmptyState";
import { Donut } from "./Donut";
import type { PipelineStageCount } from "@/lib/dashboard/data";

const MAX_SEGMENTS = 4;

// Same "active work" framing as EngagementPipelineWidget -- Completed
// engagements are excluded so the donut answers "where is open work sitting
// right now," not "how has everything ever ended up."
export function StageBreakdownWidget({ stages }: { stages: PipelineStageCount[] }) {
  const active = stages.filter((s) => s.status !== "Completed" && s.count > 0).sort((a, b) => b.count - a.count);
  const total = active.reduce((sum, s) => sum + s.count, 0);

  if (total === 0) {
    return (
      <WidgetShell title="Stage Breakdown">
        <EmptyState icon={Workflow} message="No active engagements right now." />
      </WidgetShell>
    );
  }

  const top = active.slice(0, MAX_SEGMENTS);
  const otherCount = active.slice(MAX_SEGMENTS).reduce((sum, s) => sum + s.count, 0);
  const segments = (otherCount > 0 ? [...top, { status: "Other", count: otherCount }] : top).map((s) => ({
    id: s.status,
    label: s.status,
    count: s.count,
  }));

  return (
    <WidgetShell title="Stage Breakdown" reportHref="/engagements" reportLabel="View Full Pipeline">
      <Donut segments={segments} centerLabel={String(total)} centerSublabel="Active" />
    </WidgetShell>
  );
}
