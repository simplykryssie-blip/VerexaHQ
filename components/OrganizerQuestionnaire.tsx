"use client";

import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import CurrencyInput from "@/components/CurrencyInput";
import DateField from "@/components/DateField";
import { ORGANIZER_FORMAT_CONFIG } from "@/lib/organizerFormat";
import { isFieldAnswered, isFieldVisible } from "@/lib/organizerVisibility";
import type { OrganizerField, OrganizerResponseAnswer } from "@/lib/types";

type RepeatingInstance = Record<string, unknown>;

type Props = {
  fields: OrganizerField[];
  answers: Map<string, OrganizerResponseAnswer>;
  savingFieldId: string | null;
  onSave: (field: OrganizerField, value: unknown) => void;
};

export default function OrganizerQuestionnaire({ fields, answers, savingFieldId, onSave }: Props) {
  const topLevelFields = fields
    .filter((f) => !f.parent_field_id && isFieldVisible(f, fields, answers))
    .sort((a, b) => a.display_order - b.display_order);

  return (
    <div className="bg-white border border-line rounded-sm divide-y divide-paperDim">
      {topLevelFields.map((field) =>
        field.field_type === "repeating_section" ? (
          <RepeatingSectionRow
            key={field.id}
            field={field}
            allFields={fields}
            value={answers.get(field.id)?.value}
            saving={savingFieldId === field.id}
            onSave={(value) => onSave(field, value)}
          />
        ) : (
          <FieldRow key={field.id} field={field} saving={savingFieldId === field.id}>
            {renderField(field, answers.get(field.id)?.value, (value) => onSave(field, value))}
          </FieldRow>
        ),
      )}
    </div>
  );
}

function FieldRow({ field, saving, children }: { field: OrganizerField; saving: boolean; children: React.ReactNode }) {
  return (
    <div className="px-5 py-4">
      <div className="text-sm font-semibold text-ink mb-1">
        {field.label}
        {field.is_required && <span className="text-brick"> *</span>}
      </div>
      {field.help_text && <p className="text-xs text-muted mb-1.5">{field.help_text}</p>}
      {children}
      {saving && <div className="text-[11px] text-muted mt-1.5">Saving…</div>}
    </div>
  );
}

function renderField(field: OrganizerField, value: unknown, onSave: (value: unknown) => void) {
  const inputClass = "w-full border border-line rounded-sm px-3 py-2 text-sm";

  switch (field.field_type) {
    case "checkbox":
      return (
        <div className="flex gap-2">
          {[true, false].map((choice) => (
            <button
              type="button"
              key={String(choice)}
              onClick={() => onSave(choice)}
              className={`text-xs font-semibold px-4 py-2 rounded-sm border ${value === choice ? "bg-ink text-white border-ink" : "bg-white text-ink border-line"}`}
            >
              {choice ? "Yes" : "No"}
            </button>
          ))}
        </div>
      );

    case "dropdown":
      return (
        <select value={String(value ?? "")} onChange={(e) => onSave(e.target.value)} className={inputClass}>
          <option value="">Select an answer…</option>
          {(field.options ?? []).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      );

    case "radio_button":
      return (
        <div className="flex flex-col gap-2">
          {(field.options ?? []).map((option) => (
            <label key={option} className="flex items-center gap-2 text-sm text-ink">
              <input type="radio" checked={value === option} onChange={() => onSave(option)} />
              {option}
            </label>
          ))}
        </div>
      );

    case "multiple_choice": {
      const selected = Array.isArray(value) ? value.map(String) : [];
      return (
        <div className="grid gap-2 sm:grid-cols-2">
          {(field.options ?? []).map((option) => (
            <label key={option} className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={selected.includes(option)}
                onChange={(e) => onSave(e.target.checked ? [...selected, option] : selected.filter((item) => item !== option))}
              />
              {option}
            </label>
          ))}
        </div>
      );
    }

    case "currency":
      return <CurrencyQuestion value={String(value ?? "")} onSave={onSave} />;

    case "paragraph":
    case "address":
      return <TextAreaQuestion value={String(value ?? "")} onSave={onSave} />;

    case "file_upload":
      return (
        <div className="text-xs text-muted border border-dashed border-line rounded-sm px-3 py-3">
          Upload the requested document from the Documents area, then note the filename here.
        </div>
      );

    case "signature":
      return (
        <div className="text-xs text-muted border border-dashed border-line rounded-sm px-3 py-3">
          Signature collection isn&apos;t wired up here yet — use the Signatures feature to request this
          signature separately.
        </div>
      );

    case "date":
      return <DateQuestion value={String(value ?? "")} onSave={onSave} />;

    case "ssn":
    case "ein":
      return <FormattedQuestion formatType={field.field_type} value={String(value ?? "")} onSave={onSave} />;

    case "number":
      return <NumberQuestion value={String(value ?? "")} onSave={onSave} className={inputClass} />;

    case "short_text":
    default:
      return <TextQuestion value={String(value ?? "")} onSave={onSave} className={inputClass} />;
  }
}

function TextQuestion({ value, onSave, className }: { value: string; onSave: (value: string) => void; className: string }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return <input type="text" value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={() => onSave(draft)} className={className} />;
}

function NumberQuestion({ value, onSave, className }: { value: string; onSave: (value: string) => void; className: string }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return <input type="number" value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={() => onSave(draft)} className={className} />;
}

function TextAreaQuestion({ value, onSave }: { value: string; onSave: (value: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <textarea
      value={draft}
      rows={3}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => onSave(draft)}
      className="w-full border border-line rounded-sm px-3 py-2 text-sm"
    />
  );
}

function CurrencyQuestion({ value, onSave }: { value: string; onSave: (value: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return <CurrencyInput value={draft} onChange={setDraft} onBlur={() => onSave(draft)} className="max-w-xs" />;
}

function FormattedQuestion({
  formatType,
  value,
  onSave,
}: {
  formatType: "ssn" | "ein";
  value: string;
  onSave: (value: string) => void;
}) {
  const config = ORGANIZER_FORMAT_CONFIG[formatType];
  const [draft, setDraft] = useState(value);
  const [touched, setTouched] = useState(false);

  useEffect(() => setDraft(value), [value]);

  const showError = touched && draft.length > 0 && !config.isComplete(draft);

  return (
    <div className="max-w-xs">
      <input
        type="text"
        inputMode={config.inputMode}
        value={draft}
        placeholder={config.placeholder}
        onChange={(e) => setDraft(config.mask(e.target.value))}
        onBlur={() => {
          setTouched(true);
          onSave(draft);
        }}
        className="w-full border border-line rounded-sm px-3 py-2 text-sm"
      />
      {showError && <p className="text-xs text-brick mt-1">{config.errorMessage}</p>}
    </div>
  );
}

function DateQuestion({ value, onSave }: { value: string; onSave: (value: string) => void }) {
  return (
    <div className="max-w-xs">
      {!value && <p className="text-xs text-muted mb-1">Select a date — this field is blank until you choose one.</p>}
      <DateField value={value} onChange={onSave} />
    </div>
  );
}

// A "repeating_section" field (e.g. "Dependents") holds its own array of
// instances as its answer value — organizer_response_answers has no
// instance-index column, so this is the only place multiple entries can
// live. Each instance is a { [childFieldId]: value } map.
function RepeatingSectionRow({
  field,
  allFields,
  value,
  saving,
  onSave,
}: {
  field: OrganizerField;
  allFields: OrganizerField[];
  value: unknown;
  saving: boolean;
  onSave: (value: RepeatingInstance[]) => void;
}) {
  const children = allFields.filter((f) => f.parent_field_id === field.id).sort((a, b) => a.display_order - b.display_order);
  const instances: RepeatingInstance[] = Array.isArray(value) ? (value as RepeatingInstance[]) : [];

  function updateInstance(index: number, childFieldId: string, childValue: unknown) {
    const next = instances.map((instance, i) => (i === index ? { ...instance, [childFieldId]: childValue } : instance));
    onSave(next);
  }

  function addInstance() {
    onSave([...instances, {}]);
  }

  function removeInstance(index: number) {
    onSave(instances.filter((_, i) => i !== index));
  }

  const completeCount = instances.filter((instance) =>
    children.every((child) => !child.is_required || isFieldAnswered(instance[child.id])),
  ).length;

  return (
    <div className="px-5 py-4">
      <div className="flex items-center justify-between gap-3 mb-1">
        <div className="text-sm font-semibold text-ink">{field.label}</div>
        {instances.length > 0 && (
          <span className="text-xs text-muted">
            {completeCount} of {instances.length} complete
          </span>
        )}
      </div>
      {field.help_text && <p className="text-xs text-muted mb-2">{field.help_text}</p>}
      {saving && <div className="text-[11px] text-muted mb-2">Saving…</div>}

      <div className="space-y-3">
        {instances.map((instance, index) => (
          <div key={index} className="rounded-sm border border-line p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-muted uppercase tracking-wide">
                {field.label} {index + 1}
              </span>
              <button type="button" onClick={() => removeInstance(index)} className="text-muted hover:text-brick" aria-label="Remove">
                <X size={14} />
              </button>
            </div>
            <div className="space-y-3">
              {children.map((child) => (
                <div key={child.id}>
                  <div className="text-xs font-semibold text-ink mb-1">
                    {child.label}
                    {child.is_required && <span className="text-brick"> *</span>}
                  </div>
                  {renderField(child, instance[child.id], (childValue) => updateInstance(index, child.id, childValue))}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={addInstance}
        className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-ink border border-line rounded-sm px-3 py-1.5"
      >
        <Plus size={13} /> Add another {field.label.toLowerCase()}
      </button>
    </div>
  );
}
