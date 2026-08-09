"use client";

import { useState } from "react";
import { normalizeOptions } from "@/lib/organizer/formatValue";
import { parseConditionalLogic, shouldShowField } from "@/lib/organizer/conditionalLogic";
import type { BuilderField } from "./types";

/**
 * A local-state-only stand-in for the real client-facing OrganizerForm --
 * deliberately not the same component, so a builder preview can never write
 * to organizer_response_answers. Field-type rendering is intentionally
 * simplified (no real file upload or signature capture) since there's no
 * real engagement/client context to attach either to here.
 */
export function OrganizerPreviewPanel({
  templateName,
  topLevelFields,
  childrenByParent,
}: {
  templateName: string;
  topLevelFields: BuilderField[];
  childrenByParent: Map<string, BuilderField[]>;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [repeaterRows, setRepeaterRows] = useState<Record<string, Record<string, string>[]>>({});

  const visibleFields = topLevelFields.filter((f) => shouldShowField(parseConditionalLogic(f.conditional_logic), answers));

  return (
    <main className="flex-1 overflow-y-auto bg-surfaceMuted p-6">
      <div className="mx-auto max-w-2xl rounded-xl border border-border bg-surface p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-accent">Client preview</p>
        <h2 className="mt-1 text-lg font-semibold text-ink">{templateName}</h2>
        <p className="mt-1 text-sm text-muted">This is a sandbox -- nothing typed here is saved.</p>

        <div className="mt-5 space-y-4">
          {visibleFields.length === 0 && <p className="text-sm text-muted">No fields to show yet.</p>}
          {visibleFields.map((field) =>
            field.field_type === "repeating_section" ? (
              <PreviewRepeatingSection
                key={field.id}
                field={field}
                childFields={childrenByParent.get(field.id) ?? []}
                rows={repeaterRows[field.id] ?? []}
                onChange={(rows) => setRepeaterRows((prev) => ({ ...prev, [field.id]: rows }))}
              />
            ) : (
              <PreviewField key={field.id} field={field} value={answers[field.id] ?? ""} onChange={(v) => setAnswers((p) => ({ ...p, [field.id]: v }))} />
            )
          )}
        </div>

        <div className="mt-6 flex justify-between border-t border-border pt-4">
          <button type="button" disabled className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted">
            Save &amp; exit
          </button>
          <button type="button" disabled className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white opacity-60">
            Continue →
          </button>
        </div>
      </div>
    </main>
  );
}

function PreviewRepeatingSection({
  field,
  childFields,
  rows,
  onChange,
}: {
  field: BuilderField;
  childFields: BuilderField[];
  rows: Record<string, string>[];
  onChange: (rows: Record<string, string>[]) => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-surfaceMuted p-4">
      <label className="block text-sm font-medium text-ink">
        {field.label} {field.is_required && <span className="text-danger">*</span>}
      </label>
      <div className="mt-3 space-y-3">
        {rows.length === 0 && <p className="text-xs text-muted">None added yet.</p>}
        {rows.map((row, index) => (
          <div key={index} className="rounded-lg border border-border bg-surface p-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">
                {field.label} {index + 1}
              </p>
              <button type="button" onClick={() => onChange(rows.filter((_, i) => i !== index))} className="text-xs font-medium text-danger hover:underline">
                Remove
              </button>
            </div>
            <div className="mt-2 space-y-2">
              {childFields.map((child) => (
                <PreviewField
                  key={child.id}
                  field={child}
                  value={row[child.id] ?? ""}
                  onChange={(v) => onChange(rows.map((r, i) => (i === index ? { ...r, [child.id]: v } : r)))}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
      <button type="button" onClick={() => onChange([...rows, {}])} className="mt-3 text-xs font-medium text-accent hover:underline">
        + Add another
      </button>
    </div>
  );
}

function PreviewField({ field, value, onChange }: { field: BuilderField; value: string; onChange: (value: string) => void }) {
  const options = normalizeOptions(field.options);
  const inputClass =
    "w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent";

  return (
    <div>
      <label className="block text-sm font-medium text-ink">
        {field.label} {field.is_required && <span className="text-danger">*</span>}
      </label>
      {field.help_text && <p className="mt-0.5 text-xs text-muted">{field.help_text}</p>}
      <div className="mt-1.5">
        {field.field_type === "file_upload" ? (
          <div className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted">Document upload area</div>
        ) : field.field_type === "signature" ? (
          <div className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted">Signature capture area</div>
        ) : field.field_type === "dropdown" ? (
          <select value={value} onChange={(e) => onChange(e.target.value)} className={inputClass}>
            <option value="">Select...</option>
            {options.map((o, i) => (
              <option key={i} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        ) : field.field_type === "radio_button" ? (
          <div className="space-y-1.5">
            {options.map((o, i) => (
              <label key={i} className="flex items-center gap-2 text-sm text-slate">
                <input type="radio" name={`preview-${field.id}`} checked={value === o.value} onChange={() => onChange(o.value)} />
                {o.label}
              </label>
            ))}
          </div>
        ) : field.field_type === "multiple_choice" ? (
          <div className="space-y-1.5">
            {options.map((o, i) => {
              const selected = value ? value.split(",") : [];
              return (
                <label key={i} className="flex items-center gap-2 text-sm text-slate">
                  <input
                    type="checkbox"
                    checked={selected.includes(o.value)}
                    onChange={(e) => onChange((e.target.checked ? [...selected, o.value] : selected.filter((v) => v !== o.value)).join(","))}
                  />
                  {o.label}
                </label>
              );
            })}
          </div>
        ) : field.field_type === "checkbox" ? (
          <input type="checkbox" checked={value === "true"} onChange={(e) => onChange(e.target.checked ? "true" : "false")} />
        ) : field.field_type === "date" ? (
          <input type="date" value={value} onChange={(e) => onChange(e.target.value)} className={inputClass} />
        ) : field.field_type === "number" ? (
          <input type="number" value={value} onChange={(e) => onChange(e.target.value)} className={inputClass} />
        ) : field.field_type === "currency" ? (
          <input type="number" step="0.01" value={value} onChange={(e) => onChange(e.target.value)} className={inputClass} />
        ) : field.field_type === "ssn" || field.field_type === "ein" ? (
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.field_type === "ssn" ? "XXX-XX-XXXX" : "XX-XXXXXXX"}
            className={inputClass}
          />
        ) : (
          <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={field.field_type === "address" ? 3 : 2} className={inputClass} />
        )}
      </div>
    </div>
  );
}
