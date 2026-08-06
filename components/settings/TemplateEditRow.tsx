"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Kind = "email" | "sms" | "engagement_letter";

type TemplateRow = {
  id: string;
  name: string;
  status: string;
  workspace_id: string | null;
  subject?: string | null;
  body_html?: string | null;
  body?: string | null;
};

export function TemplateEditRow({ kind, template }: { kind: Kind; template: TemplateRow }) {
  const router = useRouter();
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const table = kind === "email" ? "email_templates" : kind === "sms" ? "sms_templates" : "engagement_letter_templates";
  const bodyField: "body_html" | "body" = kind === "sms" ? "body" : "body_html";
  const isSystem = !template.workspace_id;

  const [name, setName] = useState(template.name);
  const [subject, setSubject] = useState(template.subject ?? "");
  const [body, setBody] = useState((kind === "sms" ? template.body : template.body_html) ?? "");

  async function save() {
    setSaving(true);
    setError(null);
    const patch: Record<string, string> = { name, [bodyField]: body };
    if (kind === "email") patch.subject = subject;
    const { error: updateError } = await supabase.from(table).update(patch as never).eq("id", template.id);
    setSaving(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="text-left text-sm font-medium text-ink hover:text-accent hover:underline"
      >
        {template.name}
      </button>

      {open && (
        <div className="mt-2 space-y-2 rounded-lg border border-border bg-surfaceMuted p-3">
          {isSystem ? (
            <>
              <p className="text-xs text-muted">
                This is a system default template shared across all workspaces and can&apos;t be edited here.
              </p>
              {kind === "email" && (
                <p className="text-sm text-slate">
                  <span className="font-medium">Subject:</span> {template.subject}
                </p>
              )}
              <pre className="whitespace-pre-wrap rounded-lg bg-surface p-2 text-xs text-slate">
                {kind === "sms" ? template.body : template.body_html}
              </pre>
            </>
          ) : (
            <>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Name"
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
              {kind === "email" && (
                <input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Subject"
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                />
              )}
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={7}
                placeholder="Body (use {{merge_fields}})"
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm font-mono focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
              {error && <p className="text-sm text-danger">{error}</p>}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate hover:bg-surface"
                >
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
            </>
          )}
        </div>
      )}
    </div>
  );
}
