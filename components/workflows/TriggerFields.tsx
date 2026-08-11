"use client";

import { useState } from "react";
import { ENGAGEMENT_STATUS_OPTIONS } from "@/lib/engagementStatus";

export type PipelineOption = { id: string; name: string; stages: { id: string; name: string }[] };
export type TemplateOption = { id: string; name: string };

export const TRIGGER_TYPES = [
  { value: "engagement.status_changed", label: "Engagement status changes to" },
  { value: "engagement.pipeline_stage_changed", label: "Engagement moves to a pipeline stage" },
  { value: "organizer.submitted", label: "An organizer is submitted" },
  { value: "client.tag_added", label: "A tag is added to a client" },
];

export function defaultTriggerConfig(triggerType: string, pipelines: PipelineOption[]): Record<string, unknown> {
  if (triggerType === "engagement.status_changed") return { to_status: ENGAGEMENT_STATUS_OPTIONS[0] };
  if (triggerType === "engagement.pipeline_stage_changed") {
    const stageId = pipelines[0]?.stages[0]?.id;
    return stageId ? { pipeline_stage_id: stageId } : {};
  }
  return {};
}

export function triggerSummary(triggerType: string, config: Record<string, unknown>, pipelines: PipelineOption[], organizerTemplates: TemplateOption[]) {
  if (triggerType === "engagement.status_changed") {
    return `When engagement status changes to "${config.to_status ?? "?"}"`;
  }
  if (triggerType === "engagement.pipeline_stage_changed") {
    const stageId = config.pipeline_stage_id as string | undefined;
    for (const p of pipelines) {
      const stage = p.stages.find((s) => s.id === stageId);
      if (stage) return `When it moves to "${stage.name}" on ${p.name}`;
    }
    return "When it moves to a pipeline stage";
  }
  if (triggerType === "organizer.submitted") {
    const templateId = config.organizer_template_id as string | undefined;
    const template = organizerTemplates.find((t) => t.id === templateId);
    return `When "${template?.name ?? "an organizer"}" is submitted`;
  }
  if (triggerType === "client.tag_added") {
    return `When the tag "${config.tag ?? "?"}" is added to a client`;
  }
  return triggerType;
}

export function TriggerFields({
  triggerType,
  onTriggerTypeChange,
  config,
  onConfigChange,
  pipelines,
  organizerTemplates,
  disabled,
}: {
  triggerType: string;
  onTriggerTypeChange: (t: string) => void;
  config: Record<string, unknown>;
  onConfigChange: (c: Record<string, unknown>) => void;
  pipelines: PipelineOption[];
  organizerTemplates: TemplateOption[];
  disabled?: boolean;
}) {
  const stagePipelineId =
    triggerType === "engagement.pipeline_stage_changed"
      ? pipelines.find((p) => p.stages.some((s) => s.id === config.pipeline_stage_id))?.id ?? pipelines[0]?.id
      : undefined;
  const [selectedPipelineId, setSelectedPipelineId] = useState(stagePipelineId);
  const activePipeline = pipelines.find((p) => p.id === (selectedPipelineId ?? stagePipelineId));

  return (
    <div className="grid grid-cols-2 gap-3">
      <label className="flex flex-col gap-1 text-xs text-muted">
        Trigger
        <select
          disabled={disabled}
          value={triggerType}
          onChange={(e) => {
            onTriggerTypeChange(e.target.value);
            onConfigChange(defaultTriggerConfig(e.target.value, pipelines));
          }}
          className="rounded-lg border border-border px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
        >
          {TRIGGER_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </label>

      {triggerType === "engagement.status_changed" && (
        <label className="flex flex-col gap-1 text-xs text-muted">
          Status
          <select
            disabled={disabled}
            value={(config.to_status as string) ?? ""}
            onChange={(e) => onConfigChange({ to_status: e.target.value })}
            className="rounded-lg border border-border px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
          >
            {ENGAGEMENT_STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      )}

      {triggerType === "engagement.pipeline_stage_changed" && (
        <>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Pipeline
            <select
              disabled={disabled}
              value={activePipeline?.id ?? ""}
              onChange={(e) => {
                setSelectedPipelineId(e.target.value);
                const pipeline = pipelines.find((p) => p.id === e.target.value);
                onConfigChange({ pipeline_stage_id: pipeline?.stages[0]?.id });
              }}
              className="rounded-lg border border-border px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
            >
              {pipelines.length === 0 && <option value="">No pipelines yet</option>}
              {pipelines.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Stage
            <select
              disabled={disabled || !activePipeline}
              value={(config.pipeline_stage_id as string) ?? ""}
              onChange={(e) => onConfigChange({ pipeline_stage_id: e.target.value })}
              className="rounded-lg border border-border px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
            >
              {(activePipeline?.stages ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        </>
      )}

      {triggerType === "organizer.submitted" && (
        <label className="col-span-2 flex flex-col gap-1 text-xs text-muted">
          Organizer
          <select
            disabled={disabled}
            value={(config.organizer_template_id as string) ?? ""}
            onChange={(e) => onConfigChange({ organizer_template_id: e.target.value })}
            className="rounded-lg border border-border px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
          >
            <option value="" disabled>
              Choose an organizer template
            </option>
            {organizerTemplates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {triggerType === "client.tag_added" && (
        <label className="flex flex-col gap-1 text-xs text-muted">
          Tag
          <input
            disabled={disabled}
            value={(config.tag as string) ?? ""}
            onChange={(e) => onConfigChange({ tag: e.target.value })}
            placeholder="e.g. vip"
            className="rounded-lg border border-border px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
          />
        </label>
      )}
    </div>
  );
}
