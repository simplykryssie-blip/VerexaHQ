"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { TemplateOption, PipelineOption } from "@/components/workflows/TriggerFields";
import type { StaffOption } from "@/components/workflows/WorkflowBuilder";

// `join` describes how this condition combines with the one before it in
// the list (ignored on the first condition) -- evaluated strictly left to
// right, same as a simple calculator, not with AND-before-OR precedence.
// That matches what a short visual list of conditions reads as, and is
// simple enough not to need parenthesized groups.
export type Condition = { field: string; op: string; value: string; join?: "and" | "or" };

type ValueKind =
  | "select"
  | "labeled_select"
  | "lead_stage"
  | "staff"
  | "service"
  | "category"
  | "pipeline_stage"
  | "organizer_template_status"
  | "text"
  | "number"
  | "boolean";

type FieldMeta = {
  key: string;
  label: string;
  group: string;
  valueKind: ValueKind;
  options?: string[];
  labeledOptions?: { value: string; label: string }[];
  ops: string[];
};

const OP_LABELS: Record<string, string> = {
  eq: "is",
  neq: "is not",
  in: "is any of",
  not_in: "is none of",
  gt: "is greater than",
  gte: "is at least",
  lt: "is less than",
  lte: "is at most",
  is_null: "is empty",
  is_not_null: "is not empty",
};

const SELECT_OPS = ["eq", "neq"];
const LIST_OPS = ["eq", "neq", "in", "not_in"];
const ID_OPS = ["eq", "neq", "is_null", "is_not_null"];
const NUMBER_OPS = ["eq", "neq", "gt", "gte", "lt", "lte"];

const CLIENT_TYPE_OPTIONS = ["individual", "business", "trust", "estate", "organization"];
const CLIENT_SOURCE_OPTIONS = ["public_organizer_signup", "manual", "portal_basic_info"];
// "not_sent" isn't a real client_portal_users.status value -- there's no
// row at all until an invite goes out, so evaluate_automation_conditions
// treats a missing row as 'not_sent' for this field specifically, letting
// it be selected here like any other real status.
const PORTAL_STATUS_OPTIONS = [
  { value: "not_sent", label: "Not sent" },
  { value: "invited", label: "Sent (not yet activated)" },
  { value: "active", label: "Active" },
  { value: "revoked", label: "Archived" },
];
// Same "no row yet" treatment as portal status: 'not_sent' means no
// organizer_responses row exists for this client at all.
const ORGANIZER_STATUS_OPTIONS = [
  { value: "not_sent", label: "Not sent" },
  { value: "not_started", label: "Sent, not started" },
  { value: "in_progress", label: "In progress" },
  { value: "submitted", label: "Submitted" },
  { value: "reviewed", label: "Reviewed" },
];
const ENGAGEMENT_STATUS_OPTIONS = [
  "New",
  "Waiting On Client",
  "Waiting On Staff",
  "In Progress",
  "Waiting On Review",
  "Corrections Requested",
  "Approved",
  "Waiting On Signature",
  "Waiting On Payment",
  "Ready To Release",
  "Completed",
  "Archived",
];
const ENGAGEMENT_PRIORITY_OPTIONS = ["Low", "Medium", "High", "Urgent"];
const ENGAGEMENT_CASE_TYPE_OPTIONS = ["tax_return", "bookkeeping", "payroll", "business_service", "other"];
const QUOTE_STATUS_OPTIONS = ["draft", "sent", "accepted", "declined"];
const TASK_STATUS_OPTIONS = ["pending", "in_progress", "completed", "blocked"];
const DOCUMENT_REQUEST_STATUS_OPTIONS = ["open", "completed", "cancelled"];
const LEAD_STAGE_OPTIONS = [
  { value: "lead", label: "Lead" },
  { value: "active", label: "Active client" },
  { value: "inactive", label: "Inactive" },
  { value: "archived", label: "Archived" },
  { value: "lost", label: "Lost" },
];

const CONDITION_FIELDS: FieldMeta[] = [
  { key: "client.lifecycle_status", label: "Lead / client status", group: "Lead & client", valueKind: "lead_stage", ops: LIST_OPS },
  { key: "client.client_type", label: "Client type", group: "Lead & client", valueKind: "select", options: CLIENT_TYPE_OPTIONS, ops: LIST_OPS },
  { key: "client.relationship_manager_id", label: "Assigned staff (lead/client)", group: "Lead & client", valueKind: "staff", ops: ID_OPS },
  { key: "client.tags", label: "Has tag", group: "Lead & client", valueKind: "text", ops: SELECT_OPS },
  { key: "client.service_category_id", label: "Requested category", group: "Lead & client", valueKind: "category", ops: SELECT_OPS },
  { key: "client.service_id", label: "Requested service", group: "Lead & client", valueKind: "service", ops: SELECT_OPS },
  { key: "client.source", label: "Lead source", group: "Lead & client", valueKind: "select", options: CLIENT_SOURCE_OPTIONS, ops: SELECT_OPS },
  { key: "client.portal_status", label: "Portal status", group: "Lead & client", valueKind: "labeled_select", labeledOptions: PORTAL_STATUS_OPTIONS, ops: SELECT_OPS },
  { key: "client.organizer_status", label: "Organizer status", group: "Lead & client", valueKind: "organizer_template_status", labeledOptions: ORGANIZER_STATUS_OPTIONS, ops: SELECT_OPS },
  { key: "lead.process_stage_id", label: "Lead pipeline stage", group: "Lead & client", valueKind: "pipeline_stage", ops: ID_OPS },

  { key: "engagement.status", label: "Engagement status", group: "Engagement", valueKind: "select", options: ENGAGEMENT_STATUS_OPTIONS, ops: LIST_OPS },
  { key: "engagement.priority", label: "Engagement priority", group: "Engagement", valueKind: "select", options: ENGAGEMENT_PRIORITY_OPTIONS, ops: LIST_OPS },
  { key: "engagement.case_type", label: "Engagement type", group: "Engagement", valueKind: "select", options: ENGAGEMENT_CASE_TYPE_OPTIONS, ops: LIST_OPS },
  { key: "engagement.service_id", label: "Engagement service", group: "Engagement", valueKind: "service", ops: SELECT_OPS },
  { key: "engagement.assigned_staff_id", label: "Assigned preparer", group: "Engagement", valueKind: "staff", ops: ID_OPS },
  { key: "engagement.reviewer_id", label: "Assigned reviewer", group: "Engagement", valueKind: "staff", ops: ID_OPS },
  { key: "engagement.process_id", label: "Engagement pipeline", group: "Engagement", valueKind: "select", ops: SELECT_OPS },
  { key: "engagement.process_stage_id", label: "Engagement pipeline stage", group: "Engagement", valueKind: "pipeline_stage", ops: SELECT_OPS },

  { key: "quote.status", label: "Quote status", group: "Quote", valueKind: "select", options: QUOTE_STATUS_OPTIONS, ops: LIST_OPS },
  { key: "quote.total_amount", label: "Quote amount", group: "Quote", valueKind: "number", ops: NUMBER_OPS },

  { key: "task.status", label: "Task status", group: "Task", valueKind: "select", options: TASK_STATUS_OPTIONS, ops: LIST_OPS },
  { key: "task.assigned_staff_id", label: "Task assigned to", group: "Task", valueKind: "staff", ops: ID_OPS },
  { key: "task.overdue", label: "Task is overdue", group: "Task", valueKind: "boolean", ops: ["eq"] },

  { key: "document_request.status", label: "Document request status", group: "Document request", valueKind: "select", options: DOCUMENT_REQUEST_STATUS_OPTIONS, ops: LIST_OPS },
  { key: "document_request.all_required_complete", label: "All required documents received", group: "Document request", valueKind: "boolean", ops: ["eq"] },
];

function fieldMeta(key: string): FieldMeta {
  return CONDITION_FIELDS.find((f) => f.key === key) ?? CONDITION_FIELDS[0];
}

function ConditionRow({
  condition,
  onChange,
  onRemove,
  staffOptions,
  services,
  serviceCategories,
  pipelines,
  organizerTemplates,
  disabled,
}: {
  condition: Condition;
  onChange: (next: Condition) => void;
  onRemove: () => void;
  staffOptions: StaffOption[];
  services: TemplateOption[];
  serviceCategories: TemplateOption[];
  pipelines: PipelineOption[];
  organizerTemplates: TemplateOption[];
  disabled: boolean;
}) {
  const meta = fieldMeta(condition.field);
  const stagePipeline = pipelines.find((p) => p.stages.some((s) => s.id === condition.value));
  const [stagePipelineId, setStagePipelineId] = useState(stagePipeline?.id ?? "");
  // "<organizer_template_id>|<status>" -- both halves are persisted (unlike
  // stagePipelineId above, which is only used to filter the stage dropdown),
  // since a client can have responses to more than one organizer template
  // and the status alone doesn't say which one this condition means.
  const [organizerTemplateId, organizerStatusValue] = condition.value.split("|");

  function setField(nextField: string) {
    const nextMeta = fieldMeta(nextField);
    onChange({ field: nextField, op: nextMeta.ops[0], value: "" });
  }

  function setOp(nextOp: string) {
    onChange({ ...condition, op: nextOp });
  }

  function setValue(nextValue: string) {
    onChange({ ...condition, value: nextValue });
  }

  const inputClass =
    "rounded-lg border border-border px-2 py-1.5 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60";

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface p-2">
      <select disabled={disabled} value={condition.field} onChange={(e) => setField(e.target.value)} className={inputClass}>
        {Object.entries(
          CONDITION_FIELDS.reduce<Record<string, FieldMeta[]>>((acc, f) => {
            (acc[f.group] ??= []).push(f);
            return acc;
          }, {})
        ).map(([group, fields]) => (
          <optgroup key={group} label={group}>
            {fields.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>

      <select disabled={disabled} value={condition.op} onChange={(e) => setOp(e.target.value)} className={inputClass}>
        {meta.ops.map((op) => (
          <option key={op} value={op}>
            {OP_LABELS[op]}
          </option>
        ))}
      </select>

      {condition.op !== "is_null" && condition.op !== "is_not_null" && (
        <>
          {meta.valueKind === "select" && meta.key !== "engagement.process_id" && (
            <select disabled={disabled} value={condition.value} onChange={(e) => setValue(e.target.value)} className={inputClass}>
              <option value="" disabled>
                Choose a value
              </option>
              {(meta.options ?? []).map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          )}

          {meta.key === "engagement.process_id" && (
            <select disabled={disabled} value={condition.value} onChange={(e) => setValue(e.target.value)} className={inputClass}>
              <option value="" disabled>
                Choose a pipeline
              </option>
              {pipelines.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}

          {meta.valueKind === "labeled_select" && (
            <select disabled={disabled} value={condition.value} onChange={(e) => setValue(e.target.value)} className={inputClass}>
              <option value="" disabled>
                Choose a value
              </option>
              {(meta.labeledOptions ?? []).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          )}

          {meta.valueKind === "organizer_template_status" && (
            <>
              <select
                disabled={disabled}
                value={organizerTemplateId ?? ""}
                onChange={(e) => setValue(`${e.target.value}|${organizerStatusValue ?? ""}`)}
                className={inputClass}
              >
                <option value="" disabled>
                  Choose an organizer
                </option>
                <option value="run">Whichever organizer this run sent</option>
                {organizerTemplates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <select
                disabled={disabled || !organizerTemplateId}
                value={organizerStatusValue ?? ""}
                onChange={(e) => setValue(`${organizerTemplateId ?? ""}|${e.target.value}`)}
                className={inputClass}
              >
                <option value="" disabled>
                  Choose a status
                </option>
                {(meta.labeledOptions ?? []).map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </>
          )}

          {meta.valueKind === "lead_stage" && (
            <select disabled={disabled} value={condition.value} onChange={(e) => setValue(e.target.value)} className={inputClass}>
              <option value="" disabled>
                Choose a status
              </option>
              {LEAD_STAGE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          )}

          {meta.valueKind === "staff" && (
            <select disabled={disabled} value={condition.value} onChange={(e) => setValue(e.target.value)} className={inputClass}>
              <option value="" disabled>
                Choose staff
              </option>
              {staffOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.display_name ?? "Staff"}
                </option>
              ))}
            </select>
          )}

          {meta.valueKind === "service" && (
            <select disabled={disabled} value={condition.value} onChange={(e) => setValue(e.target.value)} className={inputClass}>
              <option value="" disabled>
                Choose a service
              </option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}

          {meta.valueKind === "category" && (
            <select disabled={disabled} value={condition.value} onChange={(e) => setValue(e.target.value)} className={inputClass}>
              <option value="" disabled>
                Choose a category
              </option>
              {serviceCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}

          {meta.valueKind === "pipeline_stage" && (
            <>
              <select
                disabled={disabled}
                value={stagePipelineId}
                onChange={(e) => {
                  setStagePipelineId(e.target.value);
                  setValue("");
                }}
                className={inputClass}
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
              <select
                disabled={disabled || !stagePipelineId}
                value={condition.value}
                onChange={(e) => setValue(e.target.value)}
                className={inputClass}
              >
                <option value="" disabled>
                  Choose a stage
                </option>
                {(pipelines.find((p) => p.id === stagePipelineId)?.stages ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </>
          )}

          {meta.valueKind === "text" && (
            <input disabled={disabled} value={condition.value} onChange={(e) => setValue(e.target.value)} className={inputClass} placeholder="Value" />
          )}

          {meta.valueKind === "number" && (
            <input
              disabled={disabled}
              type="number"
              step="0.01"
              value={condition.value}
              onChange={(e) => setValue(e.target.value)}
              className={inputClass}
              placeholder="Amount"
            />
          )}

          {meta.valueKind === "boolean" && (
            <select disabled={disabled} value={condition.value || "true"} onChange={(e) => setValue(e.target.value)} className={inputClass}>
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
          )}
        </>
      )}

      {!disabled && (
        <button type="button" onClick={onRemove} className="ml-auto rounded p-1 text-muted hover:text-danger" aria-label="Remove condition">
          <Trash2 size={14} />
        </button>
      )}
    </div>
  );
}

export function ConditionsEditor({
  conditions,
  onChange,
  staffOptions,
  services,
  serviceCategories,
  pipelines,
  organizerTemplates,
  disabled,
}: {
  conditions: Condition[];
  onChange: (next: Condition[]) => void;
  staffOptions: StaffOption[];
  services: TemplateOption[];
  serviceCategories: TemplateOption[];
  pipelines: PipelineOption[];
  organizerTemplates: TemplateOption[];
  disabled?: boolean;
}) {
  function addCondition() {
    onChange([...conditions, { field: CONDITION_FIELDS[0].key, op: CONDITION_FIELDS[0].ops[0], value: "", join: "and" }]);
  }

  function updateCondition(index: number, next: Condition) {
    onChange(conditions.map((c, i) => (i === index ? next : c)));
  }

  function setJoin(index: number, join: "and" | "or") {
    onChange(conditions.map((c, i) => (i === index ? { ...c, join } : c)));
  }

  function removeCondition(index: number) {
    onChange(conditions.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-2">
      {conditions.length === 0 ? (
        <p className="text-xs text-muted">No conditions -- this workflow runs every time its trigger fires.</p>
      ) : (
        <div className="space-y-2">
          {conditions.map((c, i) => (
            <div key={i}>
              {i > 0 && (
                <div className="mb-2 flex justify-center">
                  <div className="inline-flex overflow-hidden rounded-full border border-border text-[10px] font-semibold uppercase tracking-wide">
                    {(["and", "or"] as const).map((j) => (
                      <button
                        key={j}
                        type="button"
                        disabled={disabled}
                        onClick={() => setJoin(i, j)}
                        className={`px-2.5 py-1 ${
                          (c.join ?? "and") === j ? "bg-accent text-white" : "bg-surface text-muted hover:bg-surfaceMuted"
                        } disabled:cursor-default`}
                      >
                        {j}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <ConditionRow
                condition={c}
                onChange={(next) => updateCondition(i, next)}
                onRemove={() => removeCondition(i)}
                staffOptions={staffOptions}
                services={services}
                serviceCategories={serviceCategories}
                pipelines={pipelines}
                organizerTemplates={organizerTemplates}
                disabled={Boolean(disabled)}
              />
            </div>
          ))}
        </div>
      )}
      {!disabled && (
        <button type="button" onClick={addCondition} className="inline-flex items-center gap-1.5 text-xs font-medium text-accent hover:underline">
          <Plus size={13} /> Add condition
        </button>
      )}
    </div>
  );
}
