"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { isFieldActive, validateIntakeAnswers, type IntakeAnswerValue } from "@/lib/digitalProductIntake/validation";

type FieldRow = {
  field_key: string;
  section_name: string;
  label: string;
  field_type: string;
  help_text: string | null;
  placeholder: string | null;
  default_value: string | null;
  is_required: boolean;
  display_order: number;
  options: string[] | null;
  file_config: { accept: string[]; multiple: boolean; max_files: number; max_size_bytes: number } | null;
  conditional_on_field_key: string | null;
  conditional_on_values: string[] | null;
  static_content: string | null;
};

type FormData = {
  form_id: string;
  name: string;
  workspace_name: string;
  fields: FieldRow[];
};

type AnswerValue = IntakeAnswerValue;

const inputClass =
  "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent";

export function DigitalProductIntakeForm({ token, data }: { token: string; data: FormData }) {
  const supabase = useMemo(() => createClient(), []);
  const [uploadSessionId] = useState(() => crypto.randomUUID());
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>(() => {
    const initial: Record<string, AnswerValue> = {};
    for (const field of data.fields) {
      if (field.default_value) initial[field.field_key] = field.default_value;
    }
    return initial;
  });
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const sortedFields = useMemo(() => [...data.fields].sort((a, b) => a.display_order - b.display_order), [data.fields]);
  const sections = useMemo(() => {
    const seen: string[] = [];
    for (const field of sortedFields) {
      if (!seen.includes(field.section_name)) seen.push(field.section_name);
    }
    return seen;
  }, [sortedFields]);

  function setAnswer(fieldKey: string, value: AnswerValue) {
    setAnswers((prev) => ({ ...prev, [fieldKey]: value }));
    setErrors((prev) => {
      if (!prev[fieldKey]) return prev;
      const next = { ...prev };
      delete next[fieldKey];
      return next;
    });
  }

  async function handleFileChange(field: FieldRow, fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setUploading((prev) => ({ ...prev, [field.field_key]: true }));
    setErrors((prev) => ({ ...prev, [field.field_key]: "" }));

    const existing = Array.isArray(answers[field.field_key]) ? (answers[field.field_key] as string[]) : [];
    const uploaded: string[] = [...existing];

    for (const file of Array.from(fileList)) {
      const body = new FormData();
      body.set("file", file);
      body.set("field_key", field.field_key);
      body.set("upload_session_id", uploadSessionId);

      const res = await fetch(`/api/digital-product-intake/${token}/upload`, { method: "POST", body });
      const json = (await res.json().catch(() => ({}))) as { path?: string; error?: string };
      if (!res.ok || !json.path) {
        setErrors((prev) => ({ ...prev, [field.field_key]: json.error ?? "Upload failed" }));
        continue;
      }
      uploaded.push(json.path);
      if (!field.file_config?.multiple) break;
    }

    setAnswer(field.field_key, uploaded);
    setUploading((prev) => ({ ...prev, [field.field_key]: false }));
  }

  function validate(): boolean {
    const result = validateIntakeAnswers(sortedFields, answers);
    const nextErrors = result.ok ? {} : result.errors;
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function handleSubmit() {
    if (!validate()) return;
    setSubmitting(true);
    setSubmitError(null);

    const payload: Record<string, AnswerValue> = {};
    for (const field of sortedFields) {
      if (field.field_type === "static_disclaimer") continue;
      if (!isFieldActive(field, answers)) continue;
      const value = answers[field.field_key];
      if (value !== undefined) payload[field.field_key] = value;
    }

    const { error } = await supabase.rpc("submit_digital_product_intake", { p_token: token, p_answers: payload });
    setSubmitting(false);

    if (error) {
      setSubmitError(error.message);
      return;
    }
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div className="mx-auto max-w-lg p-8 text-center">
        <h1 className="text-lg font-semibold text-ink">Thanks — we&apos;ve got everything we need.</h1>
        <p className="mt-2 text-sm text-muted">
          Your {data.workspace_name} calculator customization request has been submitted for review.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-xl font-semibold text-ink">{data.name}</h1>
      <p className="mt-1 text-sm text-muted">{data.workspace_name}</p>

      <form
        className="mt-8 space-y-10"
        onSubmit={(e) => {
          e.preventDefault();
          void handleSubmit();
        }}
      >
        {sections.map((section) => (
          <fieldset key={section} className="space-y-5">
            <legend className="text-sm font-semibold uppercase tracking-wide text-muted">{section}</legend>
            {sortedFields
              .filter((f) => f.section_name === section && isFieldActive(f, answers))
              .map((field) => (
                <div key={field.field_key}>
                  <FieldControl
                    field={field}
                    value={answers[field.field_key]}
                    uploading={Boolean(uploading[field.field_key])}
                    onChange={(value) => setAnswer(field.field_key, value)}
                    onFileChange={(files) => void handleFileChange(field, files)}
                  />
                  {errors[field.field_key] && <p className="mt-1 text-sm text-danger">{errors[field.field_key]}</p>}
                </div>
              ))}
          </fieldset>
        ))}

        {submitError && <p className="text-sm text-danger">{submitError}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-md bg-accent px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
        >
          {submitting ? "Submitting…" : "Submit"}
        </button>
      </form>
    </div>
  );
}

function FieldControl({
  field,
  value,
  uploading,
  onChange,
  onFileChange,
}: {
  field: FieldRow;
  value: AnswerValue | undefined;
  uploading: boolean;
  onChange: (value: AnswerValue) => void;
  onFileChange: (files: FileList | null) => void;
}) {
  const stringValue = typeof value === "string" ? value : "";
  const arrayValue = Array.isArray(value) ? value : [];

  if (field.field_type === "static_disclaimer") {
    return (
      <div className="rounded-md border border-border bg-surfaceMuted p-4 text-sm text-muted">
        {field.static_content}
      </div>
    );
  }

  const label = (
    <label className="mb-1.5 block text-sm font-medium text-ink">
      {field.label}
      {field.is_required && <span className="ml-0.5 text-danger">*</span>}
    </label>
  );
  const help = field.help_text ? <p className="mb-1.5 text-xs text-muted">{field.help_text}</p> : null;

  switch (field.field_type) {
    case "short_text":
    case "email":
    case "phone":
    case "url":
      return (
        <div>
          {label}
          {help}
          <input
            type={field.field_type === "email" ? "email" : field.field_type === "url" ? "url" : "text"}
            className={inputClass}
            placeholder={field.placeholder ?? undefined}
            value={stringValue}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
      );
    case "color":
      return (
        <div>
          {label}
          {help}
          <input
            type="text"
            className={inputClass}
            placeholder={field.placeholder ?? "#RRGGBB"}
            value={stringValue}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
      );
    case "long_text":
      return (
        <div>
          {label}
          {help}
          <textarea
            rows={4}
            className={inputClass}
            placeholder={field.placeholder ?? undefined}
            value={stringValue}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
      );
    case "dropdown":
      return (
        <div>
          {label}
          {help}
          <select className={inputClass} value={stringValue} onChange={(e) => onChange(e.target.value)}>
            <option value="">Select…</option>
            {(field.options ?? []).map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
      );
    case "yes_no":
      return (
        <div>
          {label}
          {help}
          <div className="flex gap-2">
            {["Yes", "No"].map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => onChange(option)}
                className={`rounded-md border px-4 py-2 text-sm ${
                  stringValue === option ? "border-accent bg-accent/10 text-accent" : "border-border text-ink"
                }`}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
      );
    case "multi_select":
      return (
        <div>
          {label}
          {help}
          <div className="space-y-2">
            {(field.options ?? []).map((option) => (
              <label key={option} className="flex items-center gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={arrayValue.includes(option)}
                  onChange={(e) => {
                    const next = e.target.checked ? [...arrayValue, option] : arrayValue.filter((v) => v !== option);
                    onChange(next);
                  }}
                />
                {option}
              </label>
            ))}
          </div>
        </div>
      );
    case "file_upload":
      return (
        <div>
          {label}
          {help}
          <input
            type="file"
            multiple={field.file_config?.multiple}
            accept={field.file_config?.accept.join(",")}
            onChange={(e) => onFileChange(e.target.files)}
            className="block text-sm text-ink"
          />
          {uploading && <p className="mt-1 text-xs text-muted">Uploading…</p>}
          {arrayValue.length > 0 && (
            <ul className="mt-1 text-xs text-muted">
              {arrayValue.map((path) => (
                <li key={path}>{path.split("/").pop()}</li>
              ))}
            </ul>
          )}
        </div>
      );
    case "checkbox_acknowledgment":
      return (
        <label className="flex items-start gap-2 text-sm text-ink">
          <input type="checkbox" checked={stringValue === "true"} onChange={(e) => onChange(e.target.checked ? "true" : "false")} className="mt-0.5" />
          <span>{field.label}</span>
        </label>
      );
    default:
      return null;
  }
}
