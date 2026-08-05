"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Paperclip, PenLine } from "lucide-react";
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

export function OrganizerForm({
  responseId,
  fields,
  initialAnswers,
  readOnly,
  workspaceId,
  entityType,
  entityId,
}: {
  responseId: string;
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
  const options = Array.isArray(field.options) ? (field.options as { label?: string; value?: string }[]) : [];

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <label htmlFor={`field-${field.id}`} className="block text-sm font-medium text-ink">
        {field.label} {field.is_required && <span className="text-danger">*</span>}
      </label>
      {field.help_text && <p className="mt-0.5 text-xs text-muted">{field.help_text}</p>}

      <div className="mt-2">
        {field.field_type === "file_upload" ? (
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
