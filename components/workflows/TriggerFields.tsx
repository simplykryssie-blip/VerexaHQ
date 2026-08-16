"use client";

import { ENGAGEMENT_STATUS_OPTIONS } from "@/lib/engagementStatus";

export type TemplateOption = { id: string; name: string };
export type PipelineOption = { id: string; name: string; stages: { id: string; name: string }[] };
export type LeadStageOption = { key: string; label: string };

export const APPOINTMENT_STATUS_OPTIONS = ["scheduled", "confirmed", "completed", "cancelled", "no_show"];

export const TRIGGER_TYPES = [
  { value: "engagement.status_changed", label: "Engagement status changes to" },
  { value: "organizer.submitted", label: "An organizer is submitted" },
  { value: "client.tag_added", label: "A tag is added to a client" },
  { value: "client.portal_created", label: "A client creates a portal account" },
  { value: "client.service_interest_selected", label: "A client selects a service" },
  { value: "engagement.created", label: "A new engagement is created for a service" },
  { value: "appointment.status_changed", label: "An appointment's status changes to" },
  { value: "engagement_letter.signed", label: "A client signs their engagement letter for a service" },
  { value: "document_request.completed", label: "All requested documents are received for a service" },
  { value: "engagement.stage_entered", label: "An engagement enters a pipeline stage" },
  { value: "lead.created", label: "A new lead is created" },
  { value: "lead.updated", label: "A lead's info is updated" },
  { value: "lead.assigned", label: "A lead is assigned to staff" },
  { value: "lead.stage_entered", label: "A lead enters a pipeline stage" },
  { value: "lead.status_changed", label: "A lead's status changes to" },
  { value: "lead.converted_to_client", label: "A lead is converted to a client" },
  { value: "lead.marked_lost", label: "A lead is marked lost" },
];

export function defaultTriggerConfig(triggerType: string): Record<string, unknown> {
  if (triggerType === "engagement.status_changed") return { to_status: ENGAGEMENT_STATUS_OPTIONS[0] };
  if (triggerType === "appointment.status_changed") return { to_status: APPOINTMENT_STATUS_OPTIONS[0] };
  return {};
}

export function triggerSummary(
  triggerType: string,
  config: Record<string, unknown>,
  organizerTemplates: TemplateOption[],
  services: TemplateOption[] = [],
  pipelines: PipelineOption[] = [],
  leadStages: LeadStageOption[] = []
) {
  if (triggerType === "engagement.status_changed") {
    return `When engagement status changes to "${config.to_status ?? "?"}"`;
  }
  if (triggerType === "organizer.submitted") {
    const templateId = config.organizer_template_id as string | undefined;
    const template = organizerTemplates.find((t) => t.id === templateId);
    return `When "${template?.name ?? "an organizer"}" is submitted`;
  }
  if (triggerType === "client.tag_added") {
    return `When the tag "${config.tag ?? "?"}" is added to a client`;
  }
  if (triggerType === "client.portal_created") {
    return "When a client creates a portal account";
  }
  if (triggerType === "client.service_interest_selected") {
    const serviceId = config.service_id as string | undefined;
    const service = services.find((s) => s.id === serviceId);
    return `When a client selects "${service?.name ?? "a service"}"`;
  }
  if (triggerType === "engagement.created") {
    const serviceId = config.service_id as string | undefined;
    const service = services.find((s) => s.id === serviceId);
    return `When a new engagement is created for "${service?.name ?? "a service"}"`;
  }
  if (triggerType === "appointment.status_changed") {
    return `When an appointment's status changes to "${config.to_status ?? "?"}"`;
  }
  if (triggerType === "engagement_letter.signed") {
    const serviceId = config.service_id as string | undefined;
    const service = services.find((s) => s.id === serviceId);
    return `When a client signs their engagement letter for "${service?.name ?? "a service"}"`;
  }
  if (triggerType === "document_request.completed") {
    const serviceId = config.service_id as string | undefined;
    const service = services.find((s) => s.id === serviceId);
    return `When all requested documents are received for "${service?.name ?? "a service"}"`;
  }
  if (triggerType === "engagement.stage_entered") {
    const processId = config.process_id as string | undefined;
    const stageId = config.process_stage_id as string | undefined;
    const pipeline = pipelines.find((p) => p.id === processId);
    const stage = pipeline?.stages.find((s) => s.id === stageId);
    return `When an engagement enters "${stage?.name ?? "a stage"}" in "${pipeline?.name ?? "a pipeline"}"`;
  }
  if (triggerType === "lead.created") {
    return "When a new lead is created";
  }
  if (triggerType === "lead.updated") {
    return "When a lead's info is updated";
  }
  if (triggerType === "lead.assigned") {
    return "When a lead is assigned to staff";
  }
  if (triggerType === "lead.stage_entered") {
    const stageKey = config.stage_key as string | undefined;
    const stage = leadStages.find((s) => s.key === stageKey);
    return `When a lead enters "${stage?.label ?? "a stage"}"`;
  }
  if (triggerType === "lead.status_changed") {
    const stageKey = config.to_status as string | undefined;
    const stage = leadStages.find((s) => s.key === stageKey);
    const label = stage?.label ?? (stageKey === "active" ? "Active" : stageKey === "lost" ? "Lost" : (stageKey ?? "?"));
    return `When a lead's status changes to "${label}"`;
  }
  if (triggerType === "lead.converted_to_client") {
    return "When a lead is converted to a client";
  }
  if (triggerType === "lead.marked_lost") {
    return "When a lead is marked lost";
  }
  return triggerType;
}

export function TriggerFields({
  triggerType,
  onTriggerTypeChange,
  config,
  onConfigChange,
  organizerTemplates,
  services = [],
  pipelines = [],
  leadStages = [],
  disabled,
}: {
  triggerType: string;
  onTriggerTypeChange: (t: string) => void;
  config: Record<string, unknown>;
  onConfigChange: (c: Record<string, unknown>) => void;
  organizerTemplates: TemplateOption[];
  services?: TemplateOption[];
  pipelines?: PipelineOption[];
  leadStages?: LeadStageOption[];
  disabled?: boolean;
}) {
  const selectedPipeline = pipelines.find((p) => p.id === (config.process_id as string | undefined));
  return (
    <div className="grid grid-cols-2 gap-3">
      <label className="flex flex-col gap-1 text-xs text-muted">
        Trigger
        <select
          disabled={disabled}
          value={triggerType}
          onChange={(e) => {
            onTriggerTypeChange(e.target.value);
            onConfigChange(defaultTriggerConfig(e.target.value));
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

      {triggerType === "engagement.created" && (
        <label className="col-span-2 flex flex-col gap-1 text-xs text-muted">
          Service
          <select
            disabled={disabled}
            value={(config.service_id as string) ?? ""}
            onChange={(e) => onConfigChange({ service_id: e.target.value })}
            className="rounded-lg border border-border px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
          >
            <option value="" disabled>
              Choose a service
            </option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {triggerType === "engagement_letter.signed" && (
        <label className="col-span-2 flex flex-col gap-1 text-xs text-muted">
          Service
          <select
            disabled={disabled}
            value={(config.service_id as string) ?? ""}
            onChange={(e) => onConfigChange({ service_id: e.target.value })}
            className="rounded-lg border border-border px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
          >
            <option value="" disabled>
              Choose a service
            </option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {triggerType === "document_request.completed" && (
        <label className="col-span-2 flex flex-col gap-1 text-xs text-muted">
          Service
          <select
            disabled={disabled}
            value={(config.service_id as string) ?? ""}
            onChange={(e) => onConfigChange({ service_id: e.target.value })}
            className="rounded-lg border border-border px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
          >
            <option value="" disabled>
              Choose a service
            </option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {triggerType === "engagement.stage_entered" && (
        <>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Pipeline
            <select
              disabled={disabled}
              value={(config.process_id as string) ?? ""}
              onChange={(e) => onConfigChange({ process_id: e.target.value, process_stage_id: "" })}
              className="rounded-lg border border-border px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
            >
              <option value="" disabled>
                Choose a pipeline
              </option>
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
              disabled={disabled || !selectedPipeline}
              value={(config.process_stage_id as string) ?? ""}
              onChange={(e) => onConfigChange({ process_id: config.process_id, process_stage_id: e.target.value })}
              className="rounded-lg border border-border px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
            >
              <option value="" disabled>
                {selectedPipeline ? "Choose a stage" : "Choose a pipeline first"}
              </option>
              {selectedPipeline?.stages.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        </>
      )}

      {triggerType === "lead.stage_entered" && (
        <label className="col-span-2 flex flex-col gap-1 text-xs text-muted">
          Stage
          <select
            disabled={disabled}
            value={(config.stage_key as string) ?? ""}
            onChange={(e) => onConfigChange({ stage_key: e.target.value })}
            className="rounded-lg border border-border px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
          >
            <option value="" disabled>
              Choose a stage
            </option>
            {leadStages.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      )}

      {triggerType === "lead.status_changed" && (
        <label className="col-span-2 flex flex-col gap-1 text-xs text-muted">
          Status
          <select
            disabled={disabled}
            value={(config.to_status as string) ?? ""}
            onChange={(e) => onConfigChange({ to_status: e.target.value })}
            className="rounded-lg border border-border px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
          >
            <option value="" disabled>
              Choose a status
            </option>
            {leadStages.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
            <option value="active">Active (converted)</option>
            <option value="lost">Lost</option>
          </select>
        </label>
      )}

      {triggerType === "client.service_interest_selected" && (
        <label className="col-span-2 flex flex-col gap-1 text-xs text-muted">
          Service
          <select
            disabled={disabled}
            value={(config.service_id as string) ?? ""}
            onChange={(e) => onConfigChange({ service_id: e.target.value })}
            className="rounded-lg border border-border px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
          >
            <option value="" disabled>
              Choose a service
            </option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {triggerType === "appointment.status_changed" && (
        <label className="flex flex-col gap-1 text-xs text-muted">
          Status
          <select
            disabled={disabled}
            value={(config.to_status as string) ?? ""}
            onChange={(e) => onConfigChange({ to_status: e.target.value })}
            className="rounded-lg border border-border px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
          >
            {APPOINTMENT_STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}
