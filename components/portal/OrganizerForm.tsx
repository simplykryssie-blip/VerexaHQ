"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";

type FieldRow = {
  id: string;
  field_type: string;
  label: string;
  help_text: string | null;
  is_required: boolean;
  options: unknown;
  parent_field_id: string | null;
};

type AnswerRow = { organizer_field_id: string; value: unknown };

const SIMPLE_FALLBACK_TYPES = new Set(["file_upload", "signature"]);

export function OrganizerForm({
  responseId,
  fields,
  initialAnswers,
  readOnly,
}: {
  responseId: string;
  fields: FieldRow[];
  initialAnswers: AnswerRow[];
  readOnly: boolean;
}) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [answers, setAnswers] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    for (const a of initialAnswers) {
      if (a.value !== null && a.value !== undefined) map[a.organizer_field_id] = String(a.value);
    }
    return map;
  });
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function saveAnswer(fieldId: string, value: string) {
    setAnswers((prev) => ({ ...prev, [fieldId]: value }));
  }

  async function saveAll() {
    setSaving(true);
    const rows = Object.entries(answers).map(([organizer_field_id, value]) => ({
      organizer_response_id: responseId,
      organizer_field_id,
      value,
    }));
    if (rows.length > 0) {
      const { error } = await supabase.from("organizer_response_answers").upsert(rows, { onConflict: "organizer_response_id,organizer_field_id" });
      if (error) {
        toast.show(error.message, "error");
        setSaving(false);
        return;
      }
    }
    setSaving(false);
    toast.show("Progress saved", "success");
    router.refresh();
  }

  async function submit() {
    await saveAll();
    setSubmitting(true);
    const { error } = await supabase.rpc("submit_organizer_response", { p_response_id: responseId });
    setSubmitting(false);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    toast.show("Organizer submitted", "success");
    router.refresh();
  }

  const topLevelFields = fields.filter((f) => !f.parent_field_id);

  return (
    <div className="space-y-4">
      {topLevelFields.map((field) => (
        <FieldInput key={field.id} field={field} value={answers[field.id] ?? ""} onChange={saveAnswer} disabled={readOnly} />
      ))}

      {!readOnly && (
        <div className="flex items-center gap-2 pt-2">
          <button
            type="button"
            onClick={saveAll}
            disabled={saving || submitting}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-slate hover:border-accent hover:text-accent disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save progress"}
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving || submitting}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-60"
          >
            {submitting ? "Submitting..." : "Submit organizer"}
          </button>
        </div>
      )}
    </div>
  );
}

function FieldInput({
  field,
  value,
  onChange,
  disabled,
}: {
  field: FieldRow;
  value: string;
  onChange: (fieldId: string, value: string) => void;
  disabled: boolean;
}) {
  const options = Array.isArray(field.options) ? (field.options as { label?: string; value?: string }[]) : [];

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <label htmlFor={`field-${field.id}`} className="block text-sm font-medium text-ink">
        {field.label} {field.is_required && <span className="text-danger">*</span>}
      </label>
      {field.help_text && <p className="mt-0.5 text-xs text-muted">{field.help_text}</p>}

      <div className="mt-2">
        {SIMPLE_FALLBACK_TYPES.has(field.field_type) ? (
          <p className="text-xs text-muted">
            {field.field_type === "file_upload"
              ? "Upload this from the Documents page instead."
              : "Signatures are handled from the Signatures tab on Documents."}
          </p>
        ) : field.field_type === "dropdown" ? (
          <select
            id={`field-${field.id}`}
            value={value}
            disabled={disabled}
            onChange={(e) => onChange(field.id, e.target.value)}
            className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:bg-surfaceMuted"
          >
            <option value="">Select...</option>
            {options.map((o, i) => (
              <option key={i} value={o.value ?? o.label ?? ""}>
                {o.label ?? o.value}
              </option>
            ))}
          </select>
        ) : field.field_type === "checkbox" ? (
          <input
            id={`field-${field.id}`}
            type="checkbox"
            checked={value === "true"}
            disabled={disabled}
            onChange={(e) => onChange(field.id, e.target.checked ? "true" : "false")}
            className="h-4 w-4 rounded border-border text-accent focus:ring-accent"
          />
        ) : field.field_type === "date" ? (
          <input
            id={`field-${field.id}`}
            type="date"
            value={value}
            disabled={disabled}
            onChange={(e) => onChange(field.id, e.target.value)}
            className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:bg-surfaceMuted"
          />
        ) : field.field_type === "currency" ? (
          <input
            id={`field-${field.id}`}
            type="number"
            step="0.01"
            value={value}
            disabled={disabled}
            onChange={(e) => onChange(field.id, e.target.value)}
            className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:bg-surfaceMuted"
          />
        ) : field.field_type === "ssn" || field.field_type === "ein" ? (
          <input
            id={`field-${field.id}`}
            type="text"
            inputMode="numeric"
            value={value}
            disabled={disabled}
            onChange={(e) => onChange(field.id, e.target.value)}
            placeholder={field.field_type === "ssn" ? "XXX-XX-XXXX" : "XX-XXXXXXX"}
            className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:bg-surfaceMuted"
          />
        ) : (
          <textarea
            id={`field-${field.id}`}
            value={value}
            disabled={disabled}
            onChange={(e) => onChange(field.id, e.target.value)}
            rows={field.field_type === "address" ? 3 : 2}
            className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:bg-surfaceMuted"
          />
        )}
      </div>
    </div>
  );
}
