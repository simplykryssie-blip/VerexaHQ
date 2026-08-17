"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Editor } from "@tiptap/react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import { Modal } from "@/components/Modal";
import { RichTextEditor, insertTextAtCursor } from "@/components/settings/RichTextEditor";
import { MergeFieldPicker } from "@/components/settings/MergeFieldPicker";
import { slugify } from "@/lib/roleSlug";

type Kind = "email" | "sms";

type TemplateRow = {
  id: string;
  name: string;
  status: string;
  workspace_id: string | null;
  subject?: string | null;
  body_html?: string | null;
  body?: string | null;
};

const SMS_SEGMENT_LENGTH = 160;

function insertAtFieldCursor(
  field: HTMLInputElement | HTMLTextAreaElement | null,
  current: string,
  text: string,
  setValue: (v: string) => void
) {
  if (!field) {
    setValue(current + text);
    return;
  }
  const start = field.selectionStart ?? current.length;
  const end = field.selectionEnd ?? current.length;
  setValue(current.slice(0, start) + text + current.slice(end));
  requestAnimationFrame(() => {
    const pos = start + text.length;
    field.focus();
    field.setSelectionRange(pos, pos);
  });
}

export function TemplateEditRow({
  kind,
  template,
  workspaceId,
  onClose,
  onDuplicated,
}: {
  kind: Kind;
  template: TemplateRow;
  workspaceId: string;
  onClose: () => void;
  /** Fired once a system template has been copied into an editable, workspace-owned row -- the caller should switch the modal over to editing it instead of closing. */
  onDuplicated: (row: TemplateRow) => void;
}) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isSystem = !template.workspace_id;

  const [name, setName] = useState(template.name);
  const [subject, setSubject] = useState(template.subject ?? "");
  const [bodyHtml, setBodyHtml] = useState(template.body_html ?? "");
  const [smsBody, setSmsBody] = useState(template.body ?? "");
  const editorRef = useRef<Editor | null>(null);
  const subjectInputRef = useRef<HTMLInputElement | null>(null);
  const smsTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  const smsLength = smsBody.length;
  const smsSegments = Math.max(1, Math.ceil(smsLength / SMS_SEGMENT_LENGTH) || 1);

  async function save() {
    setSaving(true);
    setError(null);
    const table = kind === "email" ? "email_templates" : "sms_templates";
    const patch = kind === "email" ? { name, subject, body_html: bodyHtml } : { name, body: smsBody };
    const { error: updateError } = await supabase.from(table).update(patch as never).eq("id", template.id);
    setSaving(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    toast.show("Template saved", "success");
    router.refresh();
    onClose();
  }

  async function duplicate() {
    setDuplicating(true);
    setError(null);
    const table = kind === "email" ? "email_templates" : "sms_templates";
    const base = slugify(`${template.name} copy`);
    for (let attempt = 0; attempt < 5; attempt++) {
      const slug = attempt === 0 ? base : `${base}_${attempt + 1}`;
      const { data, error: insertError } = await supabase
        .from(table)
        .insert({
          workspace_id: workspaceId,
          name: `${template.name} (copy)`,
          slug,
          status: "draft",
          ...(kind === "email" ? { subject, body_html: bodyHtml } : { body: smsBody }),
        } as never)
        .select("*")
        .single();
      if (!insertError && data) {
        setDuplicating(false);
        toast.show("Template duplicated", "success");
        router.refresh();
        onDuplicated(data as TemplateRow);
        return;
      }
      if (insertError?.code !== "23505") {
        setDuplicating(false);
        setError(insertError?.message ?? "Couldn't duplicate this template.");
        return;
      }
    }
    setDuplicating(false);
    setError("Couldn't duplicate this template -- try again.");
  }

  return (
    <Modal title={isSystem ? template.name : `Edit ${template.name}`} onClose={onClose} size="xl">
      <div className="space-y-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={isSystem}
          placeholder="Template name (internal)"
          className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:bg-surfaceMuted"
        />

        {isSystem && (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surfaceMuted px-3 py-2">
            <p className="text-xs text-muted">This is a shared default, the same one every workspace starts with -- make your own copy to change it.</p>
            <button
              type="button"
              onClick={duplicate}
              disabled={duplicating}
              className="shrink-0 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/90 disabled:opacity-60"
            >
              {duplicating ? "Duplicating..." : "Duplicate & edit"}
            </button>
          </div>
        )}

        {kind === "email" ? (
          <div className="overflow-hidden rounded-xl border border-border bg-surface">
            <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
              <span className="shrink-0 text-xs font-medium text-muted">Subject</span>
              <input
                ref={subjectInputRef}
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                disabled={isSystem}
                placeholder="Write a subject line..."
                className="w-full border-0 bg-transparent text-sm font-medium text-ink placeholder:font-normal placeholder:text-muted focus:outline-none disabled:bg-transparent"
              />
              {!isSystem && (
                <MergeFieldPicker
                  label="Insert"
                  onInsert={(token) => insertAtFieldCursor(subjectInputRef.current, subject, token, setSubject)}
                />
              )}
            </div>
            <RichTextEditor
              content={bodyHtml}
              editable={!isSystem}
              bare
              onEditorReady={(editor) => (editorRef.current = editor)}
              onChange={setBodyHtml}
              toolbarExtra={
                <MergeFieldPicker onInsert={(token) => editorRef.current && insertTextAtCursor(editorRef.current, token)} />
              }
            />
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-surfaceMuted p-4">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted">Preview</p>
              {!isSystem && (
                <MergeFieldPicker
                  onInsert={(token) => insertAtFieldCursor(smsTextareaRef.current, smsBody, token, setSmsBody)}
                />
              )}
            </div>
            <div className="mt-2 flex justify-end">
              {isSystem ? (
                <div className="max-w-[75%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-accent px-4 py-2.5 text-sm text-white">
                  {smsBody || <span className="text-white/70">(empty message)</span>}
                </div>
              ) : (
                <textarea
                  ref={smsTextareaRef}
                  value={smsBody}
                  onChange={(e) => {
                    setSmsBody(e.target.value);
                    e.target.style.height = "auto";
                    e.target.style.height = `${e.target.scrollHeight}px`;
                  }}
                  rows={1}
                  placeholder="Type your message..."
                  className="max-w-[75%] resize-none overflow-hidden rounded-2xl rounded-br-sm bg-accent px-4 py-2.5 text-sm text-white placeholder:text-white/70 focus:outline-none focus:ring-2 focus:ring-white/30"
                  style={{ minHeight: "44px", width: "320px" }}
                />
              )}
            </div>
            <p className="mt-2 text-right text-[11px] text-muted">
              {smsLength} character{smsLength === 1 ? "" : "s"} -- {smsSegments} segment{smsSegments === 1 ? "" : "s"}
            </p>
          </div>
        )}

        {error && <p className="text-sm text-danger">{error}</p>}

        {!isSystem && (
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate hover:bg-surfaceMuted">
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-60"
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}
