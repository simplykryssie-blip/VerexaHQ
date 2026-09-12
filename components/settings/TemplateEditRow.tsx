"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Editor } from "@tiptap/react";
import { Eye, EyeOff } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import { Modal } from "@/components/Modal";
import { RichTextEditor, insertTextAtCursor } from "@/components/settings/RichTextEditor";
import { MergeFieldPicker } from "@/components/settings/MergeFieldPicker";
import { BannerImageUpload } from "@/components/settings/BannerImageUpload";
import { insertAtFieldCursor } from "@/lib/insertAtFieldCursor";
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
  banner_image_url?: string | null;
  custom_css?: string | null;
};

const SMS_SEGMENT_LENGTH = 160;

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
  const [bannerImageUrl, setBannerImageUrl] = useState(template.banner_image_url ?? null);
  const [customCss, setCustomCss] = useState(template.custom_css ?? "");
  const [showPreview, setShowPreview] = useState(false);
  const editorRef = useRef<Editor | null>(null);
  const subjectInputRef = useRef<HTMLInputElement | null>(null);
  const smsTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  // A click that lands just outside the modal (easy to do by accident on a
  // long template -- the box doesn't fill the screen) used to discard
  // everything typed with zero warning, same for Escape. Guard every path
  // that closes this modal behind one confirm whenever something's actually
  // changed, for both email and SMS -- they share this same modal/close
  // wiring, so one fix covers both.
  const isDirty =
    name !== template.name ||
    subject !== (template.subject ?? "") ||
    bodyHtml !== (template.body_html ?? "") ||
    smsBody !== (template.body ?? "") ||
    bannerImageUrl !== (template.banner_image_url ?? null) ||
    customCss !== (template.custom_css ?? "");

  function requestClose() {
    if (isDirty && !window.confirm("Discard your unsaved changes to this template?")) return;
    onClose();
  }

  const smsLength = smsBody.length;
  const smsSegments = Math.max(1, Math.ceil(smsLength / SMS_SEGMENT_LENGTH) || 1);
  // Bubble width tracks the longest line instead of staying a fixed box,
  // so a short "Thanks!" doesn't sit inside the same wide rectangle as a
  // full paragraph -- clamped so a very long single line still wraps.
  const smsLongestLine = Math.max(4, ...smsBody.split("\n").map((line) => line.length));
  const smsBubbleWidthCh = Math.min(smsLongestLine + 2, 44);

  async function save() {
    setSaving(true);
    setError(null);
    const table = kind === "email" ? "email_templates" : "sms_templates";
    const patch =
      kind === "email"
        ? { name, subject, body_html: bodyHtml, banner_image_url: bannerImageUrl, custom_css: customCss.trim() || null }
        : { name, body: smsBody };
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
          ...(kind === "email" ? { subject, body_html: bodyHtml, banner_image_url: bannerImageUrl, custom_css: customCss.trim() || null } : { body: smsBody }),
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
    <Modal title={isSystem ? template.name : `Edit ${template.name}`} onClose={requestClose} size="xl">
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
          <>
            <BannerImageUpload
              workspaceId={workspaceId}
              value={bannerImageUrl}
              disabled={isSystem}
              label="Banner image (optional)"
              helpText="Rendered above the subject/body when this email is sent -- a logo header, letterhead, etc."
              uploadPathPrefix="email-banner"
              onChange={setBannerImageUrl}
            />
            <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-soft">
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

            <label className="block text-xs font-medium uppercase tracking-wide text-muted">
              Custom CSS (optional)
              <textarea
                value={customCss}
                disabled={isSystem}
                onChange={(e) => setCustomCss(e.target.value)}
                rows={4}
                placeholder=".signature { color: #0f172a; }"
                className="mt-1 w-full rounded-lg border border-border px-3 py-2 font-mono text-xs normal-case focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:bg-surfaceMuted"
              />
              <span className="mt-1 block text-[11px] normal-case text-muted">
                Sent as a &lt;style&gt; block with the email. Renders fine in Gmail, Apple Mail, and Outlook.com; very old Outlook desktop
                has limited CSS support no matter how it&apos;s delivered, so keep critical layout to what the editor above already does.
              </span>
            </label>

            <div>
              <button
                type="button"
                onClick={() => setShowPreview((v) => !v)}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-accent hover:underline"
              >
                {showPreview ? <EyeOff size={13} /> : <Eye size={13} />}
                {showPreview ? "Hide preview" : "Preview banner + CSS as it will send"}
              </button>
              {showPreview && (
                <iframe
                  title="Email preview"
                  className="mt-2 h-96 w-full rounded-lg border border-border bg-white"
                  sandbox=""
                  srcDoc={`${customCss ? `<style>${customCss}</style>` : ""}${
                    bannerImageUrl ? `<img src="${bannerImageUrl}" alt="" style="max-width:100%;display:block;margin:0 auto 16px;" />` : ""
                  }${bodyHtml}`}
                />
              )}
            </div>
          </>
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
                <div
                  className="max-w-[75%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-accent px-4 py-2.5 text-sm text-white"
                  style={{ width: `${smsBubbleWidthCh}ch` }}
                >
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
                  style={{ minHeight: "44px", width: `${smsBubbleWidthCh}ch` }}
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
            <button type="button" onClick={requestClose} className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate hover:bg-surfaceMuted">
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
