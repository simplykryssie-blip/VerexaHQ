"use client";

import { Zap } from "lucide-react";
import { ENGAGEMENT_STATUS_OPTIONS } from "@/lib/engagementStatus";
import { TagNameInput } from "@/components/workflows/TagNameInput";
import { InlineStepPickerField } from "@/components/workflows/StepPicker";

export type TemplateOption = { id: string; name: string };
export type PipelineOption = { id: string; name: string; stages: { id: string; name: string }[] };

export const APPOINTMENT_STATUS_OPTIONS = ["scheduled", "confirmed", "completed", "cancelled", "no_show"];

// Matches the review_status enum's own labels exactly (set_organizer_response_review_status
// takes these verbatim) -- displayLabel mirrors the wording already used in ReviewWorkspace.tsx's
// own REVIEW_STATUS_LABELS so "Rejected"/"Denied" and "Corrections Requested"/"Needs info" read
// the same way here as they do on the review screen itself.
export const ORGANIZER_REVIEW_STATUS_OPTIONS = [
  { value: "Approved", label: "Approved" },
  { value: "Corrections Requested", label: "Needs info" },
  { value: "Rejected", label: "Denied" },
];

// category/description/keywords are display-only metadata for the
// searchable/categorized trigger picker (components/workflows/StepPicker.tsx)
// -- they never touch execution. The engine only ever sees `value` (stored
// verbatim as automations.trigger_type); category groupings here can be
// freely renamed/reshuffled without any migration.
export const TRIGGER_CATEGORIES: { key: string; label: string }[] = [
  { key: "contacts_leads", label: "Contacts & Leads" },
  { key: "engagements", label: "Engagements" },
  { key: "forms_intake", label: "Forms & Intake" },
  { key: "appointments", label: "Appointments" },
  { key: "documents", label: "Documents" },
  { key: "tax_workflow", label: "Tax Workflow" },
  { key: "billing", label: "Payments & Billing" },
  { key: "tasks", label: "Tasks" },
  { key: "communication", label: "Communication" },
  { key: "webhooks_integrations", label: "Webhooks & Integrations" },
];

export const TRIGGER_TYPES = [
  { value: "engagement.status_changed", label: "Engagement status changes to", category: "engagements", description: "Fires when an engagement's status is set to a specific value.", keywords: "status change engagement" },
  { value: "organizer.submitted", label: "An organizer is submitted", category: "forms_intake", description: "Fires when a client submits an intake organizer.", keywords: "intake form organizer submit" },
  { value: "client.tag_added", label: "A tag is added to a client", category: "contacts_leads", description: "Fires when a specific tag is added to a client.", keywords: "tag label contact" },
  { value: "client.portal_created", label: "A client creates a portal account", category: "contacts_leads", description: "Fires when a client accepts their portal invite and creates an account.", keywords: "portal account signup" },
  { value: "client.service_interest_selected", label: "A client selects a service", category: "contacts_leads", description: "Fires when a client (or lead) selects a service they're interested in.", keywords: "service interest lead" },
  { value: "engagement.created", label: "A new engagement is created for a service", category: "engagements", description: "Fires when a new engagement is created for a specific service.", keywords: "engagement created new" },
  { value: "appointment.status_changed", label: "An appointment's status changes to", category: "appointments", description: "Fires when an appointment's status changes (booked, confirmed, completed, cancelled, no-show).", keywords: "appointment booked cancelled rescheduled no-show completed status" },
  { value: "engagement_letter.signed", label: "A client signs their document for a service", category: "tax_workflow", description: "Fires when a client signs their document.", keywords: "signature signed document letter" },
  { value: "document_request.completed", label: "All requested documents are received for a service", category: "documents", description: "Fires once every required document on a request has been received.", keywords: "documents received complete" },
  { value: "organizer_information_request.resolved", label: "An organizer information request is resolved", category: "forms_intake", description: "Fires once every flagged question on an information request has been answered, corrected, or rejected.", keywords: "information request needs info resolved organizer" },
  { value: "organizer_response.review_decided", label: "A reviewed organizer is approved, denied, or needs info", category: "forms_intake", description: "Fires when a staff reviewer sets an organizer's review decision to a specific status.", keywords: "organizer review approved denied rejected needs info decision" },
  { value: "engagement.stage_entered", label: "An engagement enters a pipeline stage", category: "engagements", description: "Fires when an engagement enters a specific stage of its pipeline.", keywords: "pipeline stage engagement" },
  { value: "lead.created", label: "A new lead is created", category: "contacts_leads", description: "Fires when a new lead is created (staff entry, public form, portal, referral, etc).", keywords: "contact created lead new" },
  { value: "lead.updated", label: "A lead's info is updated", category: "contacts_leads", description: "Fires when a lead's information is changed.", keywords: "contact changed lead updated" },
  { value: "lead.assigned", label: "A lead is assigned to staff", category: "contacts_leads", description: "Fires when a lead is assigned to a staff member.", keywords: "lead assign staff" },
  { value: "lead.stage_entered", label: "A lead enters a pipeline stage", category: "contacts_leads", description: "Fires when a lead enters a specific stage of its pipeline.", keywords: "pipeline stage lead opportunity" },
  { value: "lead.status_changed", label: "A lead's status changes to", category: "contacts_leads", description: "Fires when a lead's status changes (e.g. converted or lost).", keywords: "lead status opportunity" },
  { value: "lead.converted_to_client", label: "A lead is converted to a client", category: "contacts_leads", description: "Fires when a lead becomes an active client.", keywords: "lead convert client" },
  { value: "lead.marked_lost", label: "A lead is marked lost", category: "contacts_leads", description: "Fires when a lead is marked lost.", keywords: "lead lost close" },
  { value: "quote.created", label: "A quote is created", category: "billing", description: "Fires when a quote is created.", keywords: "quote billing estimate" },
  { value: "quote.sent", label: "A quote is sent", category: "billing", description: "Fires when a quote is sent to the client.", keywords: "quote billing sent" },
  { value: "quote.accepted", label: "A quote is accepted", category: "billing", description: "Fires when a client accepts a quote.", keywords: "quote billing accepted" },
  { value: "quote.declined", label: "A quote is declined", category: "billing", description: "Fires when a client declines a quote.", keywords: "quote billing declined" },
  { value: "document_request.sent", label: "A document request is sent", category: "documents", description: "Fires when a document request is sent to a client.", keywords: "documents request sent" },
  { value: "document.uploaded", label: "A document is uploaded", category: "documents", description: "Fires when a document is uploaded.", keywords: "documents upload" },
  { value: "task.created", label: "A task is created", category: "tasks", description: "Fires when a task is created.", keywords: "task new created" },
  { value: "task.completed", label: "A task is completed", category: "tasks", description: "Fires when a task is marked complete.", keywords: "task done complete" },
  { value: "client_message.received", label: "A client sends a message", category: "communication", description: "Fires when a client replies or sends a portal message.", keywords: "message reply customer replied" },
  { value: "task.overdue", label: "A task becomes overdue", category: "tasks", description: "Fires when a task's due date passes with it still open (checked every 6 hours).", keywords: "task overdue late" },
  { value: "webhook.received", label: "A webhook is received", category: "webhooks_integrations", description: "Fires when an external tool posts JSON to this workflow's webhook URL.", keywords: "webhook inbound integration api zapier" },
  { value: "engagement.due_date_reminder", label: "An engagement's due date is approaching", category: "engagements", description: "Fires a set number of days before or after an engagement's due date (checked every 6 hours).", keywords: "due date reminder engagement" },
  { value: "quote.expiring_reminder", label: "A quote is about to expire", category: "billing", description: "Fires a set number of days before a quote expires (checked every 6 hours).", keywords: "quote expiring reminder billing" },
  { value: "client.birthday_reminder", label: "It's near a client's birthday", category: "contacts_leads", description: "Fires a set number of days before or after a client's birthday (checked every 6 hours).", keywords: "birthday reminder date" },
  { value: "email.opened", label: "A client opens an automated email", category: "communication", description: "Fires when a client opens an email sent by a workflow.", keywords: "email opened tracking" },
  { value: "email.clicked", label: "A client clicks a link in an automated email", category: "communication", description: "Fires when a client clicks a link in an email sent by a workflow.", keywords: "email clicked link tracking" },
  { value: "email.bounced", label: "An automated email bounces", category: "communication", description: "Fires when an email sent by a workflow bounces.", keywords: "email bounced failed" },
  { value: "sms.delivered", label: "An automated text is delivered", category: "communication", description: "Fires when a text sent by a workflow is delivered.", keywords: "sms text delivered" },
  { value: "sms.failed", label: "An automated text fails to deliver", category: "communication", description: "Fires when a text sent by a workflow fails to deliver.", keywords: "sms text failed error" },
  { value: "invoice.sent", label: "An invoice is sent", category: "billing", description: "Fires when an invoice is sent to a client.", keywords: "invoice billing sent" },
  { value: "invoice.paid", label: "An invoice is paid in full", category: "billing", description: "Fires when an invoice is paid in full.", keywords: "invoice paid payment" },
  { value: "invoice.overdue", label: "An invoice becomes overdue", category: "billing", description: "Fires when an invoice's due date passes unpaid (checked every 6 hours).", keywords: "invoice overdue late payment" },
  { value: "payment_plan.installment_paid", label: "A payment plan installment is paid", category: "billing", description: "Fires when a payment plan installment is paid.", keywords: "payment plan installment paid" },
];

const QUOTE_TRIGGER_TYPES = new Set(["quote.created", "quote.sent", "quote.accepted", "quote.declined"]);

const DATE_REMINDER_TRIGGER_TYPES = new Set([
  "engagement.due_date_reminder",
  "quote.expiring_reminder",
  "client.birthday_reminder",
]);

export function defaultTriggerConfig(triggerType: string): Record<string, unknown> {
  if (triggerType === "engagement.status_changed") return { to_status: ENGAGEMENT_STATUS_OPTIONS[0] };
  if (triggerType === "appointment.status_changed") return { to_status: APPOINTMENT_STATUS_OPTIONS[0] };
  if (triggerType === "organizer_response.review_decided") return { to_status: ORGANIZER_REVIEW_STATUS_OPTIONS[0].value };
  if (DATE_REMINDER_TRIGGER_TYPES.has(triggerType)) return { direction: "before", days: 3 };
  return {};
}

export function triggerSummary(
  triggerType: string,
  config: Record<string, unknown>,
  organizerTemplates: TemplateOption[],
  services: TemplateOption[] = [],
  pipelines: PipelineOption[] = []
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
    if (!serviceId) return "When a client selects any service";
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
    return `When a client signs their document for "${service?.name ?? "a service"}"`;
  }
  if (triggerType === "document_request.completed") {
    const serviceId = config.service_id as string | undefined;
    const service = services.find((s) => s.id === serviceId);
    return `When all requested documents are received for "${service?.name ?? "a service"}"`;
  }
  if (triggerType === "organizer_information_request.resolved") {
    const templateId = config.organizer_template_id as string | undefined;
    if (!templateId) return "When an information request is resolved on any organizer";
    const template = organizerTemplates.find((t) => t.id === templateId);
    return `When an information request is resolved on "${template?.name ?? "an organizer"}"`;
  }
  if (triggerType === "engagement.stage_entered") {
    const processId = config.process_id as string | undefined;
    const stageId = config.process_stage_id as string | undefined;
    const pipeline = pipelines.find((p) => p.id === processId);
    const stage = pipeline?.stages.find((s) => s.id === stageId);
    return `When an engagement enters "${stage?.name ?? "a stage"}" in "${pipeline?.name ?? "a pipeline"}"`;
  }
  if (triggerType === "organizer_response.review_decided") {
    const status = config.to_status as string | undefined;
    const label = ORGANIZER_REVIEW_STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status ?? "?";
    const templateId = config.organizer_template_id as string | undefined;
    const template = templateId ? organizerTemplates.find((t) => t.id === templateId) : undefined;
    return `When "${template?.name ?? "an organizer"}" is reviewed and marked "${label}"`;
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
    const processId = config.process_id as string | undefined;
    const stageId = config.process_stage_id as string | undefined;
    const pipeline = pipelines.find((p) => p.id === processId);
    const stage = pipeline?.stages.find((s) => s.id === stageId);
    return `When a lead enters "${stage?.name ?? "a stage"}" in "${pipeline?.name ?? "a pipeline"}"`;
  }
  if (triggerType === "lead.status_changed") {
    const stageKey = config.to_status as string | undefined;
    const label = stageKey === "active" ? "Active" : stageKey === "lost" ? "Lost" : (stageKey ?? "?");
    return `When a lead's status changes to "${label}"`;
  }
  if (triggerType === "lead.converted_to_client") {
    return "When a lead is converted to a client";
  }
  if (triggerType === "lead.marked_lost") {
    return "When a lead is marked lost";
  }
  if (QUOTE_TRIGGER_TYPES.has(triggerType)) {
    const verb = { "quote.created": "is created", "quote.sent": "is sent", "quote.accepted": "is accepted", "quote.declined": "is declined" }[
      triggerType
    ];
    const serviceId = config.service_id as string | undefined;
    const service = serviceId ? services.find((s) => s.id === serviceId) : undefined;
    return `When a quote ${verb}${service ? ` for "${service.name}"` : ""}`;
  }
  if (triggerType === "document_request.sent") {
    return "When a document request is sent";
  }
  if (triggerType === "document.uploaded") {
    return "When a document is uploaded";
  }
  if (triggerType === "task.created") {
    return "When a task is created";
  }
  if (triggerType === "task.completed") {
    return "When a task is completed";
  }
  if (triggerType === "client_message.received") {
    return "When a client sends a message";
  }
  if (triggerType === "task.overdue") {
    return "When a task becomes overdue (checked every 6 hours)";
  }
  if (triggerType === "webhook.received") {
    return "When a webhook is received";
  }
  if (DATE_REMINDER_TRIGGER_TYPES.has(triggerType)) {
    const direction = (config.direction as string) ?? "before";
    const days = (config.days as number) ?? 0;
    const entity =
      triggerType === "engagement.due_date_reminder"
        ? "an engagement's due date"
        : triggerType === "quote.expiring_reminder"
          ? "a quote expires"
          : "a client's birthday";
    const dayLabel = days === 1 ? "1 day" : `${days} days`;
    return `${dayLabel} ${direction} ${entity} (checked every 6 hours)`;
  }
  if (triggerType === "email.opened") {
    return "When a client opens an automated email";
  }
  if (triggerType === "email.clicked") {
    return "When a client clicks a link in an automated email";
  }
  if (triggerType === "email.bounced") {
    return "When an automated email bounces";
  }
  if (triggerType === "sms.delivered") {
    return "When an automated text is delivered";
  }
  if (triggerType === "sms.failed") {
    return "When an automated text fails to deliver";
  }
  if (triggerType === "invoice.sent") {
    return "When an invoice is sent";
  }
  if (triggerType === "invoice.paid") {
    return "When an invoice is paid in full";
  }
  if (triggerType === "invoice.overdue") {
    return "When an invoice becomes overdue (checked every 6 hours)";
  }
  if (triggerType === "payment_plan.installment_paid") {
    return "When a payment plan installment is paid";
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
  tagOptions = [],
  webhookUrl,
  disabled,
}: {
  triggerType: string;
  onTriggerTypeChange: (t: string) => void;
  config: Record<string, unknown>;
  onConfigChange: (c: Record<string, unknown>) => void;
  organizerTemplates: TemplateOption[];
  services?: TemplateOption[];
  pipelines?: PipelineOption[];
  tagOptions?: string[];
  webhookUrl?: string;
  disabled?: boolean;
}) {
  const selectedPipeline = pipelines.find((p) => p.id === (config.process_id as string | undefined));
  return (
    <div className="grid grid-cols-2 gap-3">
      <label className="col-span-2 flex flex-col gap-1 text-xs text-muted">
        Trigger
        <InlineStepPickerField
          disabled={disabled}
          value={triggerType}
          items={TRIGGER_TYPES}
          categories={TRIGGER_CATEGORIES}
          icon={() => <Zap size={14} />}
          onChange={(value) => {
            onTriggerTypeChange(value);
            onConfigChange(defaultTriggerConfig(value));
          }}
        />
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

      {triggerType === "webhook.received" && webhookUrl && (
        <div className="col-span-2 flex flex-col gap-1 text-xs text-muted">
          Webhook URL -- point any external tool (Zapier, Calendly, a form on your site) here to start this workflow
          <input
            readOnly
            value={webhookUrl}
            onFocus={(e) => e.currentTarget.select()}
            className="rounded-lg border border-border bg-surfaceMuted px-3 py-2 text-sm text-ink normal-case focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <span className="mt-1 text-[11px] normal-case text-muted">
            POST JSON to this URL. An <code>email</code> or <code>phone</code> field finds or creates a matching lead; every
            field in the body becomes available to this run&apos;s conditions and merge fields.
          </span>
        </div>
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
          <TagNameInput
            disabled={disabled}
            value={(config.tag as string) ?? ""}
            onChange={(v) => onConfigChange({ tag: v })}
            tagOptions={tagOptions}
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

      {triggerType === "organizer_information_request.resolved" && (
        <label className="col-span-2 flex flex-col gap-1 text-xs text-muted">
          Organizer (optional)
          <select
            disabled={disabled}
            value={(config.organizer_template_id as string) ?? ""}
            onChange={(e) => onConfigChange({ organizer_template_id: e.target.value || undefined })}
            className="rounded-lg border border-border px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
          >
            <option value="">Any organizer template</option>
            {organizerTemplates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {triggerType === "organizer_response.review_decided" && (
        <>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Decision
            <select
              disabled={disabled}
              value={(config.to_status as string) ?? ""}
              onChange={(e) => onConfigChange({ ...config, to_status: e.target.value })}
              className="rounded-lg border border-border px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
            >
              {ORGANIZER_REVIEW_STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Organizer (optional)
            <select
              disabled={disabled}
              value={(config.organizer_template_id as string) ?? ""}
              onChange={(e) => onConfigChange({ ...config, organizer_template_id: e.target.value || undefined })}
              className="rounded-lg border border-border px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
            >
              <option value="">Any organizer template</option>
              {organizerTemplates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
        </>
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
            <option value="active">Active (converted)</option>
            <option value="lost">Lost</option>
          </select>
        </label>
      )}

      {QUOTE_TRIGGER_TYPES.has(triggerType) && (
        <label className="col-span-2 flex flex-col gap-1 text-xs text-muted">
          Service (optional)
          <select
            disabled={disabled}
            value={(config.service_id as string) ?? ""}
            onChange={(e) => onConfigChange({ service_id: e.target.value || undefined })}
            className="rounded-lg border border-border px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
          >
            <option value="">Any service</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
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
            <option value="">Any service</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <span className="text-[11px] text-muted">
            Leave as &quot;Any service&quot; to match every service at once -- pair with the &quot;Push an organizer&quot;
            action left on &quot;Auto-detect&quot; to route each one to its own linked organizer without needing a
            separate workflow per service.
          </span>
        </label>
      )}

      {DATE_REMINDER_TRIGGER_TYPES.has(triggerType) && (
        <>
          <label className="flex flex-col gap-1 text-xs text-muted">
            When
            <select
              disabled={disabled}
              value={(config.direction as string) ?? "before"}
              onChange={(e) => onConfigChange({ ...config, direction: e.target.value })}
              className="rounded-lg border border-border px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
            >
              <option value="before">Before</option>
              <option value="after">After</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Days
            <input
              disabled={disabled}
              type="number"
              min={0}
              value={(config.days as number) ?? 0}
              onChange={(e) => onConfigChange({ ...config, days: Number(e.target.value) })}
              className="rounded-lg border border-border px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
            />
          </label>
          <span className="col-span-2 text-[11px] text-muted">
            Checked every 6 hours, so this fires on the matching calendar day rather than at a precise time.
          </span>
        </>
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
