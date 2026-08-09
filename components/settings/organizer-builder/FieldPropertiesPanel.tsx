"use client";

import { useState } from "react";
import { CHOICE_FIELD_TYPES, FIELD_TYPE_LABELS } from "@/lib/organizer/fieldTypes";
import { normalizeOptions } from "@/lib/organizer/formatValue";
import { parseConditionalLogic, type ShowIfRule } from "@/lib/organizer/conditionalLogic";
import type { BuilderField } from "./types";

export function FieldPropertiesPanel({
  field,
  otherTopLevelFields,
  onUpdate,
  onDelete,
  readOnly,
}: {
  field: BuilderField | null;
  otherTopLevelFields: BuilderField[];
  onUpdate: (fieldId: string, patch: Partial<Pick<BuilderField, "label" | "help_text" | "is_required" | "options" | "conditional_logic">>) => void;
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

  return <PropertiesForm key={field.id} field={field} otherTopLevelFields={otherTopLevelFields} onUpdate={onUpdate} onDelete={onDelete} readOnly={readOnly} />;
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
  onUpdate: (fieldId: string, patch: Partial<Pick<BuilderField, "label" | "help_text" | "is_required" | "options" | "conditional_logic">>) => void;
  onDelete: (fieldId: string) => void;
  readOnly: boolean;
}) {
  const [label, setLabel] = useState(field.label);
  const [helpText, setHelpText] = useState(field.help_text ?? "");
  const options = normalizeOptions(field.options);
  const rule = parseConditionalLogic(field.conditional_logic).show_if ?? null;

  function commitOptions(next: { label: string; value: string }[]) {
    onUpdate(field.id, { options: next });
  }

  function setRule(next: ShowIfRule | null) {
    onUpdate(field.id, { conditional_logic: next ? { show_if: next } : {} });
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
            checked={rule !== null}
            disabled={readOnly || otherTopLevelFields.length === 0}
            onChange={(e) =>
              setRule(e.target.checked ? { field_id: otherTopLevelFields[0]?.id ?? "", operator: "equals", value: "" } : null)
            }
            className="h-4 w-4 rounded border-border text-accent focus:ring-accent"
          />
          Only show this field conditionally
        </label>

        {rule && (
          <div className="mt-2 space-y-2">
            <select
              value={rule.field_id}
              disabled={readOnly}
              onChange={(e) => setRule({ ...rule, field_id: e.target.value })}
              className="w-full rounded-lg border border-border px-2 py-1.5 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            >
              {otherTopLevelFields.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
            <select
              value={rule.operator}
              disabled={readOnly}
              onChange={(e) => setRule({ ...rule, operator: e.target.value as ShowIfRule["operator"] })}
              className="w-full rounded-lg border border-border px-2 py-1.5 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            >
              <option value="equals">is</option>
              <option value="not_equals">is not</option>
            </select>
            <input
              value={rule.value}
              disabled={readOnly}
              onChange={(e) => setRule({ ...rule, value: e.target.value })}
              placeholder="Value to compare against"
              className="w-full rounded-lg border border-border px-2 py-1.5 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
        )}
        {otherTopLevelFields.length === 0 && (
          <p className="mt-1 text-xs text-muted">Add another top-level field first to reference it here.</p>
        )}
      </div>
    </aside>
  );
}
