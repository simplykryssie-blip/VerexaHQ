"use client";

import { useState } from "react";
import { normalizeOptions } from "@/lib/organizer/formatValue";
import { AddressInput } from "@/components/AddressInput";
import { NameInput } from "@/components/NameInput";
import { parseConditionalLogic, shouldShowField } from "@/lib/organizer/conditionalLogic";
import { splitIntoPages } from "@/lib/organizer/pages";
import { formatPhone } from "@/lib/phone";
import type { BuilderField } from "./types";

const YES_NO_OPTIONS = [
  { label: "Yes", value: "yes" },
  { label: "No", value: "no" },
];

/**
 * A local-state-only stand-in for the real client-facing OrganizerForm --
 * deliberately not the same component, so a builder preview can never write
 * to organizer_response_answers. Field-type rendering is intentionally
 * simplified (no real file upload or signature capture) since there's no
 * real engagement/client context to attach either to here.
 */
export function OrganizerPreviewPanel({
  templateName,
  templateDescription,
  topLevelFields,
  childrenByParent,
}: {
  templateName: string;
  templateDescription: string | null;
  topLevelFields: BuilderField[];
  childrenByParent: Map<string, BuilderField[]>;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [repeaterRows, setRepeaterRows] = useState<Record<string, Record<string, string>[]>>({});
  const [pageIndex, setPageIndex] = useState(0);

  const visibleFields = topLevelFields.filter((f) => shouldShowField(parseConditionalLogic(f.conditional_logic), answers));
  const pages = splitIntoPages(visibleFields);
  const currentIndex = Math.min(pageIndex, pages.length - 1);
  const currentPage = pages[currentIndex];
  const isLastPage = currentIndex === pages.length - 1;

  return (
    <main className="flex-1 overflow-y-auto bg-surfaceMuted p-6">
      <div className="mx-auto max-w-2xl rounded-xl border border-border bg-surface p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-accent">Client preview</p>
        <h2 className="mt-1 text-lg font-semibold text-ink">{templateName}</h2>
        {templateDescription && <p className="mt-1 whitespace-pre-line text-sm text-muted">{templateDescription}</p>}
        <p className="mt-1 text-sm text-muted">This is a sandbox -- nothing typed here is saved.</p>
        {pages.length > 1 && (
          <p className="mt-2 text-xs font-medium text-muted">
            Page {currentIndex + 1} of {pages.length}
            {currentPage.title ? ` -- ${currentPage.title}` : ""}
          </p>
        )}

        <div className="mt-5 space-y-4">
          {currentPage.fields.length === 0 && <p className="text-sm text-muted">No fields to show yet.</p>}
          {currentPage.fields.map((field) =>
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
          <button
            type="button"
            disabled={currentIndex === 0}
            onClick={() => setPageIndex((i) => Math.max(0, i - 1))}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-slate disabled:opacity-40"
          >
            ← Back
          </button>
          {isLastPage ? (
            <button type="button" disabled className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white opacity-60">
              Submit
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setPageIndex((i) => Math.min(pages.length - 1, i + 1))}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90"
            >
              Continue →
            </button>
          )}
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

  if (field.field_type === "section") {
    return (
      <div className="border-b border-border pb-1.5 pt-2">
        <h3 className="text-base font-semibold text-ink">{field.label}</h3>
        {field.help_text && <p className="mt-0.5 text-sm text-muted">{field.help_text}</p>}
      </div>
    );
  }
  if (field.field_type === "rich_text") {
    return (
      <div className="rounded-xl border border-border bg-surfaceMuted p-4">
        {field.label && <p className="text-sm font-medium text-ink">{field.label}</p>}
        {field.help_text && <p className={`text-sm text-slate ${field.label ? "mt-1" : ""}`}>{field.help_text}</p>}
      </div>
    );
  }

  return (
    <div>
      <label className="block text-sm font-medium text-ink">
        {field.label} {field.is_required && <span className="text-danger">*</span>}
      </label>
      {field.help_text && <p className="mt-0.5 text-xs text-muted">{field.help_text}</p>}
      <div className="mt-1.5">
        {field.field_type === "name" ? (
          <NameInput value={value} onChange={onChange} />
        ) : field.field_type === "email" ? (
          <input type="email" value={value} onChange={(e) => onChange(e.target.value)} className={inputClass} />
        ) : field.field_type === "phone" ? (
          <input type="tel" value={value} onChange={(e) => onChange(formatPhone(e.target.value))} className={inputClass} />
        ) : field.field_type === "website" ? (
          <input type="url" value={value} placeholder="https://" onChange={(e) => onChange(e.target.value)} className={inputClass} />
        ) : field.field_type === "yes_no" ? (
          <div className="flex gap-4">
            {YES_NO_OPTIONS.map((o) => (
              <label key={o.value} className="flex items-center gap-2 text-sm text-slate">
                <input type="radio" name={`preview-${field.id}`} checked={value === o.value} onChange={() => onChange(o.value)} />
                {o.label}
              </label>
            ))}
          </div>
        ) : field.field_type === "file_upload" ? (
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
        ) : field.field_type === "address" ? (
          <AddressInput value={value} onChange={onChange} />
        ) : (
          <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={2} className={inputClass} />
        )}
      </div>
    </div>
  );
}
