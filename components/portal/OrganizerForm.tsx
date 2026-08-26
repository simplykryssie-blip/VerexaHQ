"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Paperclip, PenLine } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import { Modal } from "@/components/Modal";
import { coerceAddressAnswerToString, coerceNameAnswerToString, normalizeOptions, parseAddressValue, parseNameValue } from "@/lib/organizer/formatValue";
import { AddressInput } from "@/components/AddressInput";
import { NameInput } from "@/components/NameInput";
import { parseConditionalLogic, shouldShowField } from "@/lib/organizer/conditionalLogic";
import { splitIntoPages } from "@/lib/organizer/pages";
import { formatPhone } from "@/lib/phone";
import { fieldColSpanClass } from "@/lib/organizer/layoutWidth";
import { OrganizerPrintSummary } from "@/components/portal/OrganizerPrintSummary";

const YES_NO_OPTIONS = [
  { label: "Yes", value: "yes" },
  { label: "No", value: "no" },
];

type FieldRow = {
  id: string;
  field_type: string;
  label: string;
  help_text: string | null;
  is_required: boolean;
  options: unknown;
  parent_field_id: string | null;
  conditional_logic?: unknown;
  client_profile_field?: string | null;
  layout_width?: string | null;
};

type AnswerRow = { organizer_field_id: string; value: unknown; instance_index?: number };

function isFieldAnswered(field: FieldRow, value: string, repeaterRowCount?: number): boolean {
  if (field.field_type === "repeating_section") return (repeaterRowCount ?? 0) > 0;
  if (field.field_type === "checkbox") return value === "true";
  return value.trim() !== "";
}

export function OrganizerForm({
  responseId,
  templateName,
  fields,
  initialAnswers,
  readOnly,
  workspaceId,
  entityType,
  entityId,
}: {
  responseId: string;
  templateName: string;
  fields: FieldRow[];
  initialAnswers: AnswerRow[];
  readOnly: boolean;
  workspaceId: string;
  entityType: "client" | "engagement";
  entityId: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();

  const repeaterFields = fields.filter((f) => f.field_type === "repeating_section" && !f.parent_field_id);
  const childFieldsByParent = new Map(repeaterFields.map((r) => [r.id, fields.filter((f) => f.parent_field_id === r.id)]));
  const repeaterChildIds = new Set(repeaterFields.flatMap((r) => (childFieldsByParent.get(r.id) ?? []).map((c) => c.id)));

  const fieldTypeById = new Map(fields.map((f) => [f.id, f.field_type]));
  const answerToString = (fieldId: string, value: unknown): string => {
    const type = fieldTypeById.get(fieldId);
    if (type === "address") return coerceAddressAnswerToString(value);
    if (type === "name") return coerceNameAnswerToString(value);
    if (type === "phone") return formatPhone(String(value));
    return String(value);
  };

  const [answers, setAnswers] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    for (const a of initialAnswers) {
      if (repeaterChildIds.has(a.organizer_field_id)) continue;
      if (a.value !== null && a.value !== undefined) map[a.organizer_field_id] = answerToString(a.organizer_field_id, a.value);
    }
    return map;
  });
  const [repeaterRows, setRepeaterRows] = useState<Record<string, Record<string, string>[]>>(() => {
    const result: Record<string, Record<string, string>[]> = {};
    for (const repeater of repeaterFields) {
      const childIds = new Set((childFieldsByParent.get(repeater.id) ?? []).map((c) => c.id));
      const relevant = initialAnswers.filter((a) => childIds.has(a.organizer_field_id));
      const maxInstance = relevant.reduce((max, a) => Math.max(max, a.instance_index ?? 0), -1);
      const rows: Record<string, string>[] = [];
      for (let i = 0; i <= maxInstance; i++) {
        const row: Record<string, string> = {};
        for (const a of relevant) {
          if ((a.instance_index ?? 0) === i && a.value !== null && a.value !== undefined) {
            row[a.organizer_field_id] = answerToString(a.organizer_field_id, a.value);
          }
        }
        rows.push(row);
      }
      result[repeater.id] = rows;
    }
    return result;
  });
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [pageIndex, setPageIndex] = useState(0);
  const [justSubmitted, setJustSubmitted] = useState(false);

  async function saveAnswer(fieldId: string, value: string) {
    setAnswers((prev) => ({ ...prev, [fieldId]: value }));
  }

  async function saveAll() {
    setSaving(true);
    const rows = Object.entries(answers).map(([organizer_field_id, value]) => ({
      organizer_response_id: responseId,
      organizer_field_id,
      value,
      instance_index: 0,
    }));

    for (const repeater of repeaterFields) {
      const children = childFieldsByParent.get(repeater.id) ?? [];
      const repRows = repeaterRows[repeater.id] ?? [];
      for (const child of children) {
        // Clear out any rows beyond the current count (e.g. a dependent was
        // removed) so stale answers don't linger under a dropped instance.
        const { error: deleteError } = await supabase
          .from("organizer_response_answers")
          .delete()
          .eq("organizer_response_id", responseId)
          .eq("organizer_field_id", child.id)
          .gte("instance_index", repRows.length);
        if (deleteError) {
          toast.show(deleteError.message, "error");
          setSaving(false);
          return;
        }
        repRows.forEach((row, i) => {
          if (row[child.id] !== undefined) {
            rows.push({ organizer_response_id: responseId, organizer_field_id: child.id, value: row[child.id], instance_index: i });
          }
        });
      }
    }

    if (rows.length > 0) {
      const { error } = await supabase
        .from("organizer_response_answers")
        .upsert(rows, { onConflict: "organizer_response_id,organizer_field_id,instance_index" });
      if (error) {
        toast.show(error.message, "error");
        setSaving(false);
        return;
      }
    }

    // Fields the builder tagged as "prefill from client profile" propose
    // their current value back to the client record -- applied immediately
    // if the client record has nothing there yet, otherwise queued for
    // staff approval. Repeater children are never mapped (a repeating
    // section can't correspond to a single client-record field).
    for (const field of fields) {
      if (!field.client_profile_field || repeaterChildIds.has(field.id)) continue;
      const value = answers[field.id];
      if (!value) continue;

      if (field.client_profile_field === "mailing_address") {
        const parts = parseAddressValue(value);
        await supabase.rpc("propose_client_mailing_address", {
          p_street: parts.street,
          p_city: parts.city,
          p_state: parts.state,
          p_zip: parts.zip,
          p_organizer_response_id: responseId,
          p_organizer_field_id: field.id,
        });
      } else if (field.client_profile_field === "full_name") {
        const parts = parseNameValue(value);
        await supabase.rpc("propose_client_full_name", {
          p_first_name: parts.first,
          p_middle_name: parts.middle,
          p_last_name: parts.last,
          p_suffix: parts.suffix,
          p_organizer_response_id: responseId,
          p_organizer_field_id: field.id,
        });
      } else if (field.client_profile_field === "date_of_birth") {
        await supabase.rpc("propose_client_date_of_birth", {
          p_new_value: value,
          p_organizer_response_id: responseId,
          p_organizer_field_id: field.id,
        });
      } else if (field.client_profile_field === "ssn") {
        await supabase.rpc("propose_client_sensitive_field", {
          p_field: "ssn",
          p_new_value: value,
          p_organizer_response_id: responseId,
          p_organizer_field_id: field.id,
        });
      } else {
        await supabase.rpc("propose_client_contact_field", {
          p_field: field.client_profile_field,
          p_new_value: value,
          p_organizer_response_id: responseId,
          p_organizer_field_id: field.id,
        });
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
    fetch("/api/documents/file-organizer-response", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ responseId }),
    }).catch(() => {
      // Best-effort -- the submission itself is already recorded; filing
      // it into Documents can be retried later if this fails.
    });
    // A toast alone was easy to miss -- nothing on screen told the client
    // their organizer actually went through. This blocks on an explicit
    // "OK" instead, then sends them back to the dashboard rather than
    // leaving them looking at the (now read-only) form they just finished.
    setJustSubmitted(true);
  }

  function backToDashboard() {
    router.push("/portal/dashboard");
    router.refresh();
  }

  const topLevelFields = fields
    .filter((f) => !f.parent_field_id)
    .filter((f) => shouldShowField(parseConditionalLogic(f.conditional_logic), answers));
  const pages = splitIntoPages(topLevelFields);
  const currentIndex = Math.min(pageIndex, pages.length - 1);
  const currentPage = pages[currentIndex];
  const isLastPage = currentIndex === pages.length - 1;

  function unmetRequiredOnCurrentPage(): FieldRow[] {
    return currentPage.fields.filter(
      (f) => f.is_required && !isFieldAnswered(f, answers[f.id] ?? "", repeaterRows[f.id]?.length)
    );
  }

  function goNext() {
    const unmet = unmetRequiredOnCurrentPage();
    if (unmet.length > 0) {
      toast.show(`Please answer: ${unmet.map((f) => f.label).join(", ")}`, "error");
      return;
    }
    setPageIndex((i) => Math.min(pages.length - 1, i + 1));
  }

  function submitWithValidation() {
    const unmet = unmetRequiredOnCurrentPage();
    if (unmet.length > 0) {
      toast.show(`Please answer: ${unmet.map((f) => f.label).join(", ")}`, "error");
      return;
    }
    submit();
  }

  return (
    <div className="space-y-4">
      {justSubmitted && (
        <Modal title="Organizer submitted" onClose={backToDashboard}>
          <div className="flex flex-col items-center gap-3 py-2 text-center">
            <CheckCircle2 size={40} className="text-success" aria-hidden="true" />
            <p className="text-sm text-slate">
              Your organizer has been submitted. Your firm has been notified and will review your answers.
            </p>
            <button
              type="button"
              onClick={backToDashboard}
              className="mt-2 w-full rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90"
            >
              OK
            </button>
          </div>
        </Modal>
      )}
      {readOnly && (
        <OrganizerPrintSummary
          templateName={templateName}
          topLevelFields={topLevelFields}
          childrenByParent={childFieldsByParent}
          answers={answers}
          repeaterRows={repeaterRows}
        />
      )}
      <div className="print:hidden">
        {pages.length > 1 && (
          <p className="mb-4 text-xs font-medium text-muted">
            Page {currentIndex + 1} of {pages.length}
            {currentPage.title ? ` -- ${currentPage.title}` : ""}
          </p>
        )}
        <div className="grid grid-cols-12 gap-x-5 gap-y-6">
        {currentPage.fields.map((field) =>
          field.field_type === "repeating_section" ? (
            <RepeatingSectionInput
              key={field.id}
              field={field}
              childFields={childFieldsByParent.get(field.id) ?? []}
              rows={repeaterRows[field.id] ?? []}
              onChange={(rows) => setRepeaterRows((prev) => ({ ...prev, [field.id]: rows }))}
              disabled={readOnly}
              workspaceId={workspaceId}
              entityType={entityType}
              entityId={entityId}
            />
          ) : (
            <FieldInput
              key={field.id}
              field={field}
              value={answers[field.id] ?? ""}
              onChange={saveAnswer}
              disabled={readOnly}
              workspaceId={workspaceId}
              entityType={entityType}
              entityId={entityId}
            />
          )
        )}
        </div>
      </div>

      {!readOnly && (
        <div className="flex items-center gap-2 pt-2">
          {pages.length > 1 && (
            <button
              type="button"
              onClick={() => setPageIndex((i) => Math.max(0, i - 1))}
              disabled={currentIndex === 0}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-slate hover:border-accent hover:text-accent disabled:opacity-40"
            >
              Back
            </button>
          )}
          {pages.length > 1 && !isLastPage && (
            <button
              type="button"
              onClick={goNext}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-slate hover:border-accent hover:text-accent"
            >
              Next
            </button>
          )}
          <button
            type="button"
            onClick={saveAll}
            disabled={saving || submitting}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-slate hover:border-accent hover:text-accent disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save progress"}
          </button>
          {(pages.length === 1 || isLastPage) && (
            <button
              type="button"
              onClick={submitWithValidation}
              disabled={saving || submitting}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-60"
            >
              {submitting ? "Submitting..." : "Submit organizer"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function RepeatingSectionInput({
  field,
  childFields,
  rows,
  onChange,
  disabled,
  workspaceId,
  entityType,
  entityId,
}: {
  field: FieldRow;
  childFields: FieldRow[];
  rows: Record<string, string>[];
  onChange: (rows: Record<string, string>[]) => void;
  disabled: boolean;
  workspaceId: string;
  entityType: "client" | "engagement";
  entityId: string;
}) {
  function updateRow(index: number, childFieldId: string, value: string) {
    onChange(rows.map((row, i) => (i === index ? { ...row, [childFieldId]: value } : row)));
  }

  function removeRow(index: number) {
    onChange(rows.filter((_, i) => i !== index));
  }

  return (
    <div className="col-span-12 rounded-2xl border border-border bg-surfaceMuted/60 p-5">
      <label className="block text-sm font-semibold text-ink">
        {field.label} {field.is_required && <span className="text-danger">*</span>}
      </label>
      {field.help_text && <p className="mt-0.5 text-xs text-muted">{field.help_text}</p>}

      <div className="mt-3 space-y-3">
        {rows.length === 0 && <p className="text-xs text-muted">None added yet.</p>}
        {rows.map((row, index) => (
          <div key={index} className="rounded-xl border border-border bg-surface p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-accent">
                {field.label} {index + 1}
              </p>
              {!disabled && (
                <button type="button" onClick={() => removeRow(index)} className="text-xs font-medium text-danger hover:underline">
                  Remove
                </button>
              )}
            </div>
            <div className="mt-3 grid grid-cols-12 gap-x-4 gap-y-4">
              {childFields.map((child) => (
                <FieldInput
                  key={child.id}
                  field={child}
                  value={row[child.id] ?? ""}
                  onChange={(fieldId, value) => updateRow(index, fieldId, value)}
                  disabled={disabled}
                  workspaceId={workspaceId}
                  entityType={entityType}
                  entityId={entityId}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {!disabled && (
        <button type="button" onClick={() => onChange([...rows, {}])} className="mt-3 text-xs font-semibold text-accent hover:underline">
          + Add another
        </button>
      )}
    </div>
  );
}

function FileUploadField({
  fieldId,
  value,
  onChange,
  disabled,
  workspaceId,
  entityType,
  entityId,
}: {
  fieldId: string;
  value: string;
  onChange: (fieldId: string, value: string) => void;
  disabled: boolean;
  workspaceId: string;
  entityType: "client" | "engagement";
  entityId: string;
}) {
  const supabase = createClient();
  const toast = useToast();
  const [uploading, setUploading] = useState(false);

  let parsed: { attachment_id: string; file_name: string } | null = null;
  try {
    parsed = value ? JSON.parse(value) : null;
  } catch {
    parsed = null;
  }

  async function handleFile(file: File) {
    setUploading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const path = `${workspaceId}/${entityId}/${Date.now()}-${file.name}`;
    const { error: uploadError } = await supabase.storage.from("client-documents").upload(path, file);
    if (uploadError) {
      setUploading(false);
      toast.show(uploadError.message, "error");
      return;
    }
    const { data: attachment, error: insertError } = await supabase
      .from("attachments")
      .insert({
        workspace_id: workspaceId,
        entity_type: entityType,
        entity_id: entityId,
        file_name: file.name,
        storage_path: path,
        mime_type: file.type || null,
        file_size_bytes: file.size,
        uploaded_by: user?.id,
        visibility: "client_visible",
      })
      .select("id")
      .single();
    setUploading(false);
    if (insertError || !attachment) {
      toast.show(insertError?.message ?? "Could not save the upload.", "error");
      return;
    }
    onChange(fieldId, JSON.stringify({ attachment_id: attachment.id, file_name: file.name }));
    toast.show("File uploaded", "success");
  }

  if (parsed) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <Paperclip size={14} className="text-muted" aria-hidden="true" />
        <span className="text-slate">{parsed.file_name}</span>
        {!disabled && (
          <label className="cursor-pointer text-xs font-medium text-accent hover:underline">
            Replace
            <input
              type="file"
              className="sr-only"
              disabled={uploading}
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
          </label>
        )}
      </div>
    );
  }

  return (
    <label className={`flex w-fit items-center gap-1.5 text-sm font-medium ${disabled ? "text-muted" : "cursor-pointer text-accent hover:underline"}`}>
      <Paperclip size={14} aria-hidden="true" />
      {uploading ? "Uploading..." : "Upload file"}
      {!disabled && (
        <input type="file" className="sr-only" disabled={uploading} onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
      )}
    </label>
  );
}

function SignatureField({
  fieldId,
  value,
  onChange,
  disabled,
}: {
  fieldId: string;
  value: string;
  onChange: (fieldId: string, value: string) => void;
  disabled: boolean;
}) {
  const [typedName, setTypedName] = useState("");

  let parsed: { typed_name: string; signed_at: string } | null = null;
  try {
    parsed = value ? JSON.parse(value) : null;
  } catch {
    parsed = null;
  }

  if (parsed) {
    return (
      <p className="flex items-center gap-1.5 text-sm text-green-700">
        <PenLine size={14} aria-hidden="true" />
        Signed by {parsed.typed_name} on {new Date(parsed.signed_at).toLocaleDateString()}
      </p>
    );
  }

  if (disabled) {
    return <p className="text-xs text-muted">Not signed.</p>;
  }

  return (
    <div className="flex items-center gap-2">
      <input
        value={typedName}
        onChange={(e) => setTypedName(e.target.value)}
        placeholder="Type your full name"
        className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
      />
      <button
        type="button"
        disabled={!typedName.trim()}
        onClick={() => onChange(fieldId, JSON.stringify({ typed_name: typedName.trim(), signed_at: new Date().toISOString() }))}
        className="shrink-0 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-60"
      >
        Sign
      </button>
    </div>
  );
}

function FieldInput({
  field,
  value,
  onChange,
  disabled,
  workspaceId,
  entityType,
  entityId,
}: {
  field: FieldRow;
  value: string;
  onChange: (fieldId: string, value: string) => void;
  disabled: boolean;
  workspaceId: string;
  entityType: "client" | "engagement";
  entityId: string;
}) {
  const options = normalizeOptions(field.options);
  const inputClass =
    "w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm shadow-sm transition focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30 disabled:bg-surfaceMuted disabled:text-muted";

  if (field.field_type === "section") {
    return (
      <div className="col-span-12 border-l-[3px] border-accent py-1 pl-3.5">
        <h3 className="text-lg font-semibold text-ink">{field.label}</h3>
        {field.help_text && <p className="mt-0.5 text-sm text-muted">{field.help_text}</p>}
      </div>
    );
  }
  if (field.field_type === "rich_text") {
    return (
      <div className="col-span-12 rounded-xl border border-border bg-surfaceMuted p-4">
        {field.label && <p className="text-sm font-medium text-ink">{field.label}</p>}
        {field.help_text && <p className={`text-sm text-slate ${field.label ? "mt-1" : ""}`}>{field.help_text}</p>}
      </div>
    );
  }

  return (
    <div className={fieldColSpanClass(field.field_type, field.layout_width)}>
      <label htmlFor={`field-${field.id}`} className="block text-sm font-semibold text-ink">
        {field.label} {field.is_required && <span className="text-danger">*</span>}
      </label>
      {field.help_text && <p className="mt-0.5 text-xs text-muted">{field.help_text}</p>}

      <div className="mt-1.5">
        {field.field_type === "name" ? (
          <NameInput value={value} onChange={(v) => onChange(field.id, v)} disabled={disabled} />
        ) : field.field_type === "email" ? (
          <input
            id={`field-${field.id}`}
            type="email"
            value={value}
            disabled={disabled}
            onChange={(e) => onChange(field.id, e.target.value)}
            className={inputClass}
          />
        ) : field.field_type === "phone" ? (
          <input
            id={`field-${field.id}`}
            type="tel"
            value={value}
            disabled={disabled}
            onChange={(e) => onChange(field.id, formatPhone(e.target.value))}
            className={inputClass}
          />
        ) : field.field_type === "website" ? (
          <input
            id={`field-${field.id}`}
            type="url"
            value={value}
            disabled={disabled}
            placeholder="https://"
            onChange={(e) => onChange(field.id, e.target.value)}
            className={inputClass}
          />
        ) : field.field_type === "yes_no" ? (
          <div className="flex gap-4">
            {YES_NO_OPTIONS.map((o) => (
              <label key={o.value} className="flex items-center gap-2 text-sm text-slate">
                <input
                  type="radio"
                  name={`field-${field.id}`}
                  checked={value === o.value}
                  disabled={disabled}
                  onChange={() => onChange(field.id, o.value)}
                  className="h-4 w-4 border-border text-accent focus:ring-accent"
                />
                {o.label}
              </label>
            ))}
          </div>
        ) : field.field_type === "file_upload" ? (
          <FileUploadField
            fieldId={field.id}
            value={value}
            onChange={onChange}
            disabled={disabled}
            workspaceId={workspaceId}
            entityType={entityType}
            entityId={entityId}
          />
        ) : field.field_type === "signature" ? (
          <SignatureField fieldId={field.id} value={value} onChange={onChange} disabled={disabled} />
        ) : field.field_type === "dropdown" ? (
          <select
            id={`field-${field.id}`}
            value={value}
            disabled={disabled}
            onChange={(e) => onChange(field.id, e.target.value)}
            className={inputClass}
          >
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
                <input
                  type="radio"
                  name={`field-${field.id}`}
                  checked={value === o.value}
                  disabled={disabled}
                  onChange={() => onChange(field.id, o.value)}
                  className="h-4 w-4 border-border text-accent focus:ring-accent"
                />
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
                    disabled={disabled}
                    onChange={(e) => {
                      const next = e.target.checked ? [...selected, o.value] : selected.filter((v) => v !== o.value);
                      onChange(field.id, next.join(","));
                    }}
                    className="h-4 w-4 rounded border-border text-accent focus:ring-accent"
                  />
                  {o.label}
                </label>
              );
            })}
          </div>
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
            className={inputClass}
          />
        ) : field.field_type === "number" ? (
          <input
            id={`field-${field.id}`}
            type="number"
            value={value}
            disabled={disabled}
            onChange={(e) => onChange(field.id, e.target.value)}
            className={inputClass}
          />
        ) : field.field_type === "currency" ? (
          <input
            id={`field-${field.id}`}
            type="number"
            step="0.01"
            value={value}
            disabled={disabled}
            onChange={(e) => onChange(field.id, e.target.value)}
            className={inputClass}
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
            className={inputClass}
          />
        ) : field.field_type === "address" ? (
          <AddressInput value={value} onChange={(v) => onChange(field.id, v)} disabled={disabled} />
        ) : (
          <textarea
            id={`field-${field.id}`}
            value={value}
            disabled={disabled}
            onChange={(e) => onChange(field.id, e.target.value)}
            rows={2}
            className={inputClass}
          />
        )}
      </div>
    </div>
  );
}

