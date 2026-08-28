"use client";

import { useState } from "react";
import { CHOICE_FIELD_TYPES, FIELD_TYPE_LABELS, NON_ANSWERABLE_FIELD_TYPES } from "@/lib/organizer/fieldTypes";
import { normalizeOptions } from "@/lib/organizer/formatValue";
import { parseConditionalLogic, type LogicOperator, type Rule, type ShowIf } from "@/lib/organizer/conditionalLogic";
import { CLIENT_PROFILE_FIELDS_BY_TYPE, CLIENT_PROFILE_FIELD_LABELS } from "@/lib/organizer/clientProfileFields";
import { RELATIONSHIP_ROLES_BY_TYPE, RELATIONSHIP_ROLE_LABELS } from "@/lib/organizer/relationshipRoles";
import { isWidthEligible } from "@/lib/organizer/layoutWidth";
import { RichTextEditor } from "@/components/settings/RichTextEditor";
import type { BuilderField } from "./types";

const OPERATOR_LABELS: Record<LogicOperator, string> = {
  equals: "is",
  not_equals: "is not",
  includes: "includes",
  not_includes: "doesn't include",
  is_answered: "is answered",
  is_blank: "is blank",
};

const VALUE_LESS_OPERATORS = new Set<LogicOperator>(["is_answered", "is_blank"]);

const YES_NO_OPTIONS = [
  { label: "Yes", value: "yes" },
  { label: "No", value: "no" },
];

export function FieldPropertiesPanel({
  field,
  otherTopLevelFields,
  onUpdate,
  onDelete,
  readOnly,
}: {
  field: BuilderField | null;
  otherTopLevelFields: BuilderField[];
  onUpdate: (
    fieldId: string,
    patch: Partial<
      Pick<
        BuilderField,
        "label" | "help_text" | "body_html" | "is_required" | "options" | "conditional_logic" | "client_profile_field" | "relationship_role" | "layout_width"
      >
    >
  ) => void;
  onDelete: (fieldId: string) => void;
  readOnly: boolean;
}) {
  if (!field) {
    return (
      <aside className="w-72 shrink-0 overflow-y-auto border-l border-border bg-surface p-4">
        <p className="text-xs font-semibold text-ink">Field properties</p>
        <p className="mt-1 text-xs text-muted">Select a field on the canvas to edit it.</p>
      </aside>
    );
  }

  if (field.field_type === "page_break") {
    return <PageBreakForm key={field.id} field={field} onUpdate={onUpdate} onDelete={onDelete} readOnly={readOnly} />;
  }

  return <PropertiesForm key={field.id} field={field} otherTopLevelFields={otherTopLevelFields} onUpdate={onUpdate} onDelete={onDelete} readOnly={readOnly} />;
}

function PageBreakForm({
  field,
  onUpdate,
  onDelete,
  readOnly,
}: {
  field: BuilderField;
  onUpdate: (fieldId: string, patch: Partial<Pick<BuilderField, "label">>) => void;
  onDelete: (fieldId: string) => void;
  readOnly: boolean;
}) {
  const [label, setLabel] = useState(field.label);

  return (
    <aside className="w-72 shrink-0 overflow-y-auto border-l border-border bg-surface p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-ink">Page break</p>
        {!readOnly && (
          <button type="button" onClick={() => onDelete(field.id)} className="text-xs font-medium text-danger hover:underline">
            Delete
          </button>
        )}
      </div>
      <p className="mt-1 text-xs text-muted">
        Everything above this splits into its own page; everything below starts a new one. Not a question -- nothing is asked here.
      </p>

      <label className="mt-4 block text-xs font-medium uppercase tracking-wide text-muted">
        Next page&apos;s title (optional)
        <input
          value={label}
          disabled={readOnly}
          onChange={(e) => setLabel(e.target.value)}
          onBlur={() => label !== field.label && onUpdate(field.id, { label })}
          placeholder="e.g. Income"
          className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:bg-surfaceMuted"
        />
      </label>
    </aside>
  );
}

function PropertiesForm({
  field,
  otherTopLevelFields,
  onUpdate,
  onDelete,
  readOnly,
}: {
  field: BuilderField;
  otherTopLevelFields: BuilderField[];
  onUpdate: (
    fieldId: string,
    patch: Partial<
      Pick<
        BuilderField,
        "label" | "help_text" | "body_html" | "is_required" | "options" | "conditional_logic" | "client_profile_field" | "relationship_role" | "layout_width"
      >
    >
  ) => void;
  onDelete: (fieldId: string) => void;
  readOnly: boolean;
}) {
  const [label, setLabel] = useState(field.label);
  const [helpText, setHelpText] = useState(field.help_text ?? "");
  const options = normalizeOptions(field.options);
  const showIf = parseConditionalLogic(field.conditional_logic).show_if ?? null;

  function commitOptions(next: { label: string; value: string }[]) {
    onUpdate(field.id, { options: next });
  }

  function setShowIf(next: ShowIf | null) {
    onUpdate(field.id, { conditional_logic: next ? { show_if: next } : {} });
  }

  function updateCondition(index: number, patch: Partial<Rule>) {
    if (!showIf) return;
    const conditions = showIf.conditions.map((c, i) => (i === index ? { ...c, ...patch } : c));
    setShowIf({ ...showIf, conditions });
  }

  function removeCondition(index: number) {
    if (!showIf) return;
    const conditions = showIf.conditions.filter((_, i) => i !== index);
    setShowIf(conditions.length > 0 ? { ...showIf, conditions } : null);
  }

  function addCondition() {
    const firstField = otherTopLevelFields[0];
    if (!firstField) return;
    const newRule: Rule = { field_id: firstField.id, operator: "equals", value: "" };
    setShowIf(showIf ? { ...showIf, conditions: [...showIf.conditions, newRule] } : { match: "all", conditions: [newRule] });
  }

  return (
    <aside className="w-72 shrink-0 overflow-y-auto border-l border-border bg-surface p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-ink">Field properties</p>
        {!readOnly && (
          <button type="button" onClick={() => onDelete(field.id)} className="text-xs font-medium text-danger hover:underline">
            Delete
          </button>
        )}
      </div>
      <p className="mt-1 text-xs text-muted">{FIELD_TYPE_LABELS[field.field_type]}</p>

      {field.field_type === "rich_text" ? (
        <div className="mt-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Content</p>
          <div className="mt-1.5">
            <RichTextEditor content={field.body_html ?? ""} onChange={(html) => onUpdate(field.id, { body_html: html })} editable={!readOnly} bare />
          </div>
        </div>
      ) : field.field_type !== "checkbox" ? (
        <>
          <label className="mt-4 block text-xs font-medium uppercase tracking-wide text-muted">
            Label
            <input
              value={label}
              disabled={readOnly}
              onChange={(e) => setLabel(e.target.value)}
              onBlur={() => label !== field.label && onUpdate(field.id, { label })}
              className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:bg-surfaceMuted"
            />
          </label>

          <label className="mt-4 block text-xs font-medium uppercase tracking-wide text-muted">
            Help text
            <textarea
              value={helpText}
              disabled={readOnly}
              onChange={(e) => setHelpText(e.target.value)}
              onBlur={() => helpText !== (field.help_text ?? "") && onUpdate(field.id, { help_text: helpText || null })}
              rows={2}
              placeholder="Optional guidance shown under the question"
              className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:bg-surfaceMuted"
            />
          </label>
        </>
      ) : (
        <p className="mt-4 text-[11px] text-muted">Add each checkbox&apos;s text below -- no separate question label needed.</p>
      )}

      {!NON_ANSWERABLE_FIELD_TYPES.has(field.field_type) && (
        <label className="mt-4 flex items-center gap-2 text-sm text-slate">
          <input
            type="checkbox"
            checked={field.is_required}
            disabled={readOnly}
            onChange={(e) => onUpdate(field.id, { is_required: e.target.checked })}
            className="h-4 w-4 rounded border-border text-accent focus:ring-accent"
          />
          Required
        </label>
      )}

      {isWidthEligible(field.field_type) && (
        <div className="mt-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted">Shrink to half width</p>
            <p className="mt-0.5 text-[11px] text-muted">Sits side by side with the next half-width field.</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={field.layout_width === "half"}
            disabled={readOnly}
            onClick={() => onUpdate(field.id, { layout_width: field.layout_width === "half" ? "full" : "half" })}
            className={`relative h-6 w-11 shrink-0 rounded-full border transition disabled:opacity-60 ${
              field.layout_width === "half" ? "border-accent bg-accent" : "border-border bg-border"
            }`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${
                field.layout_width === "half" ? "left-[22px]" : "left-0.5"
              }`}
            />
          </button>
        </div>
      )}

      {CLIENT_PROFILE_FIELDS_BY_TYPE[field.field_type] && (
        <label className="mt-4 block text-xs font-medium uppercase tracking-wide text-muted">
          Prefill from client profile
          <select
            value={field.client_profile_field ?? ""}
            disabled={readOnly}
            onChange={(e) => onUpdate(field.id, { client_profile_field: e.target.value || null })}
            className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm normal-case focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:bg-surfaceMuted"
          >
            <option value="">None</option>
            {CLIENT_PROFILE_FIELDS_BY_TYPE[field.field_type]!.map((cpf) => (
              <option key={cpf} value={cpf}>
                {CLIENT_PROFILE_FIELD_LABELS[cpf]}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-[11px] normal-case text-muted">
            Fills in from the client&apos;s record when they open this form. If they change it, the update needs your approval before it
            overwrites what&apos;s on file.
          </span>
        </label>
      )}

      {RELATIONSHIP_ROLES_BY_TYPE[field.field_type] && (
        <label className="mt-4 block text-xs font-medium uppercase tracking-wide text-muted">
          Record as a relationship
          <select
            value={field.relationship_role ?? ""}
            disabled={readOnly}
            onChange={(e) => onUpdate(field.id, { relationship_role: e.target.value || null })}
            className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm normal-case focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:bg-surfaceMuted"
          >
            <option value="">None</option>
            {RELATIONSHIP_ROLES_BY_TYPE[field.field_type]!.map((role) => (
              <option key={role} value={role}>
                {RELATIONSHIP_ROLE_LABELS[role]}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-[11px] normal-case text-muted">
            When the client submits this form, their answer here is saved as a spouse or dependent on their contact card --
            no manual entry needed. The choices above are limited by this question&apos;s type (name / date / SSN / dropdown), not
            by what the question is actually asking -- only pick one if this question truly captures that piece of information
            about a spouse or dependent. For dependents, put the tagged fields (name, date of birth, relationship) inside a
            repeating section so each repeat becomes a separate person; spouse fields should stay outside any repeating section.
          </span>
        </label>
      )}

      {CHOICE_FIELD_TYPES.has(field.field_type) && (
        <div className="mt-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Choices</p>
          <div className="mt-1.5 space-y-1.5">
            {options.map((o, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <input
                  value={o.label}
                  disabled={readOnly}
                  onChange={(e) => {
                    const next = [...options];
                    next[i] = { label: e.target.value, value: e.target.value };
                    commitOptions(next);
                  }}
                  className="w-full rounded-lg border border-border px-2 py-1.5 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:bg-surfaceMuted"
                />
                {!readOnly && (
                  <button type="button" onClick={() => commitOptions(options.filter((_, j) => j !== i))} className="text-xs text-danger">
                    ✕
                  </button>
                )}
              </div>
            ))}
            {!readOnly && (
              <button
                type="button"
                onClick={() => commitOptions([...options, { label: "", value: "" }])}
                className="text-xs font-medium text-accent hover:underline"
              >
                + Add choice
              </button>
            )}
          </div>
        </div>
      )}

      <div className="mt-4 border-t border-border pt-4">
        <label className="flex items-center gap-2 text-sm text-slate">
          <input
            type="checkbox"
            checked={showIf !== null}
            disabled={readOnly || otherTopLevelFields.length === 0}
            onChange={(e) =>
              setShowIf(
                e.target.checked
                  ? { match: "all", conditions: [{ field_id: otherTopLevelFields[0]?.id ?? "", operator: "equals", value: "" }] }
                  : null
              )
            }
            className="h-4 w-4 rounded border-border text-accent focus:ring-accent"
          />
          Only show this field conditionally
        </label>
        <p className="mt-1 text-xs text-muted">Skipping a question is the same as hiding it -- if it doesn&apos;t show, it isn&apos;t asked.</p>

        {showIf && (
          <div className="mt-3 space-y-3">
            {showIf.conditions.length > 1 && (
              <div className="flex items-center gap-2 text-xs text-slate">
                <span>Match</span>
                <select
                  value={showIf.match}
                  disabled={readOnly}
                  onChange={(e) => setShowIf({ ...showIf, match: e.target.value as "all" | "any" })}
                  className="rounded-lg border border-border px-2 py-1 text-xs focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                >
                  <option value="all">all conditions (AND)</option>
                  <option value="any">any condition (OR)</option>
                </select>
              </div>
            )}

            {showIf.conditions.map((rule, i) => {
              const targetField = otherTopLevelFields.find((f) => f.id === rule.field_id);
              const targetOptions = targetField
                ? targetField.field_type === "yes_no"
                  ? YES_NO_OPTIONS
                  : normalizeOptions(targetField.options)
                : [];
              const usesOptionPicker =
                targetField &&
                (targetField.field_type === "yes_no" || CHOICE_FIELD_TYPES.has(targetField.field_type)) &&
                targetOptions.length > 0;
              const needsValue = !VALUE_LESS_OPERATORS.has(rule.operator);

              return (
                <div key={i} className="space-y-1.5 rounded-lg border border-border p-2">
                  {i > 0 && <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">{showIf.match === "any" ? "or" : "and"}</p>}
                  <div className="flex items-center gap-1.5">
                    <select
                      value={rule.field_id}
                      disabled={readOnly}
                      onChange={(e) => updateCondition(i, { field_id: e.target.value, value: "" })}
                      className="w-full rounded-lg border border-border px-2 py-1.5 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                    >
                      {otherTopLevelFields.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                    {!readOnly && showIf.conditions.length > 1 && (
                      <button type="button" onClick={() => removeCondition(i)} className="shrink-0 text-xs text-danger" aria-label="Remove condition">
                        ✕
                      </button>
                    )}
                  </div>
                  <select
                    value={rule.operator}
                    disabled={readOnly}
                    onChange={(e) => updateCondition(i, { operator: e.target.value as LogicOperator })}
                    className="w-full rounded-lg border border-border px-2 py-1.5 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                  >
                    {Object.entries(OPERATOR_LABELS).map(([op, opLabel]) => (
                      <option key={op} value={op}>
                        {opLabel}
                      </option>
                    ))}
                  </select>
                  {needsValue &&
                    (usesOptionPicker ? (
                      <select
                        value={rule.value}
                        disabled={readOnly}
                        onChange={(e) => updateCondition(i, { value: e.target.value })}
                        className="w-full rounded-lg border border-border px-2 py-1.5 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                      >
                        <option value="">Select a value...</option>
                        {targetOptions.map((o, oi) => (
                          <option key={oi} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        value={rule.value}
                        disabled={readOnly}
                        onChange={(e) => updateCondition(i, { value: e.target.value })}
                        placeholder="Value to compare against"
                        className="w-full rounded-lg border border-border px-2 py-1.5 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                      />
                    ))}
                </div>
              );
            })}

            {!readOnly && (
              <button type="button" onClick={addCondition} className="text-xs font-medium text-accent hover:underline">
                + Add condition
              </button>
            )}
          </div>
        )}
        {otherTopLevelFields.length === 0 && (
          <p className="mt-1 text-xs text-muted">Add another top-level field first to reference it here.</p>
        )}
      </div>
    </aside>
  );
}
