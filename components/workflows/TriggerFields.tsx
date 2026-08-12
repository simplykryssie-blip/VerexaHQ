"use client";

import { ENGAGEMENT_STATUS_OPTIONS } from "@/lib/engagementStatus";

export type TemplateOption = { id: string; name: string };

export const APPOINTMENT_STATUS_OPTIONS = ["scheduled", "confirmed", "completed", "cancelled", "no_show"];

export const TRIGGER_TYPES = [
  { value: "engagement.status_changed", label: "Engagement status changes to" },
  { value: "organizer.submitted", label: "An organizer is submitted" },
  { value: "client.tag_added", label: "A tag is added to a client" },
  { value: "client.portal_created", label: "A client creates a portal account" },
  { value: "engagement.created", label: "A new engagement is created for a service" },
  { value: "appointment.status_changed", label: "An appointment's status changes to" },
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
  services: TemplateOption[] = []
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
  if (triggerType === "engagement.created") {
    const serviceId = config.service_id as string | undefined;
    const service = services.find((s) => s.id === serviceId);
    return `When a new engagement is created for "${service?.name ?? "a service"}"`;
  }
  if (triggerType === "appointment.status_changed") {
    return `When an appointment's status changes to "${config.to_status ?? "?"}"`;
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
  disabled,
}: {
  triggerType: string;
  onTriggerTypeChange: (t: string) => void;
  config: Record<string, unknown>;
  onConfigChange: (c: Record<string, unknown>) => void;
  organizerTemplates: TemplateOption[];
  services?: TemplateOption[];
  disabled?: boolean;
}) {
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
