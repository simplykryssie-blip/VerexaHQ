"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { Editor } from "@tiptap/react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import { TemplateStatusCycle } from "@/components/settings/TemplateStatusCycle";
import { RichTextEditor, insertTextAtCursor } from "./RichTextEditor";
import { MergeFieldPicker } from "./MergeFieldPicker";
import { EngagementLetterPreview } from "./EngagementLetterPreview";
import { extractMergeFieldTokens } from "@/lib/engagementLetters/mergeFields";

export type EngagementLetterTemplateRow = {
  id: string;
  name: string;
  slug: string;
  status: string;
  workspace_id: string | null;
  body_html: string;
  requires_signature: boolean;
  merge_fields: unknown;
};

export function EngagementLetterEditor({ template }: { template: EngagementLetterTemplateRow }) {
  const supabase = createClient();
  const toast = useToast();
  const readOnly = !template.workspace_id;

  const [name, setName] = useState(template.name);
  const [bodyHtml, setBodyHtml] = useState(template.body_html);
  const [requiresSignature, setRequiresSignature] = useState(template.requires_signature);
  const [view, setView] = useState<"edit" | "preview">("edit");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const editorRef = useRef<Editor | null>(null);

  const usedTokens = extractMergeFieldTokens(bodyHtml);

  async function save() {
    setSaving(true);
    const { error } = await supabase
      .from("engagement_letter_templates")
      .update({
        name,
        body_html: bodyHtml,
        requires_signature: requiresSignature,
        merge_fields: usedTokens,
      })
      .eq("id", template.id);
    setSaving(false);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    setDirty(false);
    toast.show("Saved", "success");
  }

  return (
    <div className="flex h-screen flex-col">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-surface px-4">
        <Link href="/settings/templates?tab=engagement-letter" className="inline-flex items-center gap-1.5 text-xs font-medium text-muted hover:text-ink">
          <ArrowLeft size={14} /> Engagement letters
        </Link>
        <div className="text-center">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-accent">Engagement letter</p>
          <p className="text-sm font-semibold text-ink">
            {name} {readOnly && <span className="ml-1 rounded-full bg-surfaceMuted px-2 py-0.5 text-[10px] font-medium text-muted">System</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!readOnly && <TemplateStatusCycle table="engagement_letter_templates" id={template.id} status={template.status} />}
          <button
            type="button"
            onClick={() => setView((v) => (v === "edit" ? "preview" : "edit"))}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-slate hover:border-accent hover:text-accent"
          >
            {view === "edit" ? "Preview" : "Back to editor"}
          </button>
          {!readOnly && view === "edit" && (
            <button
              type="button"
              onClick={save}
              disabled={saving || !dirty}
              className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/90 disabled:opacity-60"
            >
              {saving ? "Saving..." : "Save"}
            </button>
          )}
        </div>
      </header>

      {readOnly && (
        <p className="border-b border-border bg-surfaceMuted px-4 py-2 text-xs text-muted">
          This is a system default and can&apos;t be edited here -- clone the service it belongs to first.
        </p>
      )}

      <div className="flex-1 overflow-y-auto bg-surfaceMuted p-6">
        {view === "preview" ? (
          <EngagementLetterPreview bodyHtml={bodyHtml} requiresSignature={requiresSignature} />
        ) : (
          <div className="mx-auto max-w-2xl space-y-4">
            <div className="rounded-xl border border-border bg-surface p-4">
              <label className="block text-xs font-medium uppercase tracking-wide text-muted">
                Name
                <input
                  value={name}
                  disabled={readOnly}
                  onChange={(e) => {
                    setName(e.target.value);
                    setDirty(true);
                  }}
                  className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:bg-surfaceMuted"
                />
              </label>

              <label className="mt-3 flex items-center gap-2 text-sm text-slate">
                <input
                  type="checkbox"
                  checked={requiresSignature}
                  disabled={readOnly}
                  onChange={(e) => {
                    setRequiresSignature(e.target.checked);
                    setDirty(true);
                  }}
                  className="h-4 w-4 rounded border-border text-accent focus:ring-accent"
                />
                Requires client signature
              </label>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-medium uppercase tracking-wide text-muted">Body</p>
                {!readOnly && (
                  <MergeFieldPicker onInsert={(token) => editorRef.current && insertTextAtCursor(editorRef.current, token)} />
                )}
              </div>
              <RichTextEditor
                content={bodyHtml}
                editable={!readOnly}
                onEditorReady={(editor) => (editorRef.current = editor)}
                onChange={(html) => {
                  setBodyHtml(html);
                  setDirty(true);
                }}
              />
            </div>

            {usedTokens.length > 0 && (
              <div className="rounded-xl border border-border bg-surface p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted">Merge fields used in this letter</p>
                <p className="mt-1 flex flex-wrap gap-1.5">
                  {usedTokens.map((t) => (
                    <code key={t} className="rounded bg-surfaceMuted px-1.5 py-0.5 text-xs">{`{{${t}}}`}</code>
                  ))}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
