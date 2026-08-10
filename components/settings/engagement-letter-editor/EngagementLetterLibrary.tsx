"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileSignature } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { TemplateGallery, type GalleryCard } from "@/components/settings/TemplateGallery";

export type EngagementLetterCard = {
  id: string;
  name: string;
  status: string;
  workspace_id: string | null;
  requires_signature: boolean;
  merge_field_count: number;
};

export function EngagementLetterLibrary({ workspaceId, templates }: { workspaceId: string; templates: EngagementLetterCard[] }) {
  const router = useRouter();
  const supabase = createClient();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cards: GalleryCard[] = templates.map((t) => ({
    id: t.id,
    name: t.name,
    status: t.status,
    isSystem: !t.workspace_id,
    href: `/templates/engagement-letters/${t.id}`,
    actionLabel: t.workspace_id ? "Edit" : "View",
    badges: [
      ...(t.requires_signature ? ["Requires signature"] : []),
      `${t.merge_field_count} merge field${t.merge_field_count === 1 ? "" : "s"}`,
    ],
  }));

  async function createTemplate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const { data, error } = await supabase
      .from("engagement_letter_templates")
      .insert({ workspace_id: workspaceId, name, slug, body_html: "<p></p>", status: "draft" })
      .select("id")
      .single();
    setSaving(false);
    if (error || !data) {
      setError(error?.message ?? "Could not create engagement letter.");
      return;
    }
    router.push(`/templates/engagement-letters/${data.id}`);
  }

  return (
    <div>
      <TemplateGallery
        cards={cards}
        icon={FileSignature}
        statusTable="engagement_letter_templates"
        searchPlaceholder="Search engagement letters..."
        emptyMessage="No engagement letters match."
        createTileLabel="Create new engagement letter"
        onCreateClick={() => setCreating(true)}
      />

      {creating && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4">
          <form onSubmit={createTemplate} className="w-full max-w-md rounded-xl border border-border bg-surface p-5 shadow-lg">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-ink">New engagement letter</h2>
              <button type="button" onClick={() => setCreating(false)} className="text-lg text-muted hover:text-ink">
                ×
              </button>
            </div>
            <div className="mt-4 space-y-3">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Name"
                required
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
              <input
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="Slug (unique key)"
                required
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
              {error && <p className="text-sm text-danger">{error}</p>}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setCreating(false)} className="rounded-lg px-3 py-1.5 text-sm text-slate hover:bg-surfaceMuted">
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-60"
              >
                {saving ? "Creating..." : "Create & open editor"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
