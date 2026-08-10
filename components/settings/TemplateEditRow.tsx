"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Editor } from "@tiptap/react";
import { createClient } from "@/lib/supabase/client";
import { Modal } from "@/components/Modal";
import { RichTextEditor, insertTextAtCursor } from "@/components/settings/RichTextEditor";
import { MergeFieldPicker } from "@/components/settings/MergeFieldPicker";

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

function insertAtTextareaCursor(textarea: HTMLTextAreaElement | null, current: string, text: string, setValue: (v: string) => void) {
  if (!textarea) {
    setValue(current + text);
    return;
  }
  const start = textarea.selectionStart ?? current.length;
  const end = textarea.selectionEnd ?? current.length;
  setValue(current.slice(0, start) + text + current.slice(end));
  requestAnimationFrame(() => {
    const pos = start + text.length;
    textarea.focus();
    textarea.setSelectionRange(pos, pos);
  });
}

export function TemplateEditRow({ kind, template, onClose }: { kind: Kind; template: TemplateRow; onClose: () => void }) {
  const router = useRouter();
  const supabase = createClient();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isSystem = !template.workspace_id;

  const [name, setName] = useState(template.name);
  const [subject, setSubject] = useState(template.subject ?? "");
  const [bodyHtml, setBodyHtml] = useState(template.body_html ?? "");
  const [smsBody, setSmsBody] = useState(template.body ?? "");
  const editorRef = useRef<Editor | null>(null);
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
    router.refresh();
    onClose();
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
          <p className="text-xs text-muted">
            This is a system default template shared across all workspaces and can&apos;t be edited here.
          </p>
        )}

        {kind === "email" ? (
          <div className="overflow-hidden rounded-xl border border-border bg-surface">
            <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
              <span className="shrink-0 text-xs font-medium text-muted">Subject</span>
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                disabled={isSystem}
                placeholder="Write a subject line..."
                className="w-full border-0 bg-transparent text-sm font-medium text-ink placeholder:font-normal placeholder:text-muted focus:outline-none disabled:bg-transparent"
              />
            </div>
            <RichTextEditor
              content={bodyHtml}
              editable={!isSystem}
              bare
              onEditorReady={(editor) => (editorRef.current = editor)}
              onChange={setBodyHtml}
            />
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-surfaceMuted p-4">
            <p className="mb-2 text-center text-[10px] font-medium uppercase tracking-wide text-muted">Preview</p>
            <div className="flex justify-end">
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

        {!isSystem && (
          <div className="flex justify-end">
            <MergeFieldPicker
              onInsert={(token) => {
                if (kind === "email") {
                  if (editorRef.current) insertTextAtCursor(editorRef.current, token);
                } else {
                  insertAtTextareaCursor(smsTextareaRef.current, smsBody, token, setSmsBody);
                }
              }}
            />
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
