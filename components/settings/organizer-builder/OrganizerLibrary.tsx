"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardList, Import } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { TemplateGallery, type GalleryCard } from "@/components/settings/TemplateGallery";
import { JotFormImportModal } from "@/components/settings/organizer-builder/JotFormImportModal";
import { ShareTemplateModal, type DownlineWorkspace } from "@/components/settings/ShareTemplateModal";
import { slugify } from "@/lib/roleSlug";
import { useToast } from "@/components/Toast";

export type OrganizerCard = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  workspace_id: string | null;
  topLevelFieldCount: number;
  totalFieldCount: number;
};

export function OrganizerLibrary({
  workspaceId,
  templates,
  isJotformConnected,
  downlineWorkspaces,
}: {
  workspaceId: string;
  templates: OrganizerCard[];
  isJotformConnected: boolean;
  downlineWorkspaces: DownlineWorkspace[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sharingCard, setSharingCard] = useState<GalleryCard | null>(null);

  const cards: GalleryCard[] = templates.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    status: t.status,
    isSystem: !t.workspace_id,
    href: `/templates/organizers/${t.id}`,
    actionLabel: t.workspace_id ? "Edit" : "View",
    badges: [
      `${t.topLevelFieldCount} fields`,
      ...(t.totalFieldCount !== t.topLevelFieldCount ? [`${t.totalFieldCount} total incl. repeats`] : []),
    ],
  }));

  async function createTemplate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const base = slugify(name);
    for (let attempt = 0; attempt < 5; attempt++) {
      const slug = attempt === 0 ? base : `${base}-${attempt + 1}`;
      const { data, error } = await supabase
        .from("organizer_templates")
        .insert({ workspace_id: workspaceId, name, slug, description: description || null, status: "draft" })
        .select("id")
        .single();
      if (!error && data) {
        setSaving(false);
        router.push(`/templates/organizers/${data.id}`);
        return;
      }
      if (error?.code !== "23505") {
        setSaving(false);
        setError(error?.message ?? "Could not create organizer.");
        return;
      }
    }
    setSaving(false);
    setError("Could not create organizer -- try a slightly different name.");
  }

  async function deleteTemplate(card: GalleryCard) {
    if (!window.confirm(`Delete "${card.name}"? This can't be undone.`)) return;
    const { error } = await supabase.from("organizer_templates").delete().eq("id", card.id);
    if (error) {
      // organizer_responses.organizer_template_id is a NO ACTION foreign key --
      // the database itself refuses this delete if a client has ever answered
      // this organizer, rather than silently orphaning their real answers.
      toast.show(
        error.code === "23503"
          ? "Can't delete -- a client has already submitted answers for this organizer. Archive it instead."
          : error.message,
        "error"
      );
      return;
    }
    toast.show("Organizer deleted", "success");
    router.refresh();
  }

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <button
          type="button"
          onClick={() => setImporting(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-slate hover:bg-surfaceMuted"
        >
          <Import size={14} /> Import from JotForm
        </button>
      </div>

      {importing && <JotFormImportModal workspaceId={workspaceId} isConnected={isJotformConnected} onClose={() => setImporting(false)} />}

      <TemplateGallery
        cards={cards}
        icon={ClipboardList}
        statusTable="organizer_templates"
        searchPlaceholder="Search organizer templates..."
        emptyMessage="No organizer templates match."
        createTileLabel="Create new organizer"
        onCreateClick={() => setCreating(true)}
        onDeleteClick={deleteTemplate}
        onShareClick={downlineWorkspaces.length > 0 ? (card) => setSharingCard(card) : undefined}
      />

      {sharingCard && (
        <ShareTemplateModal
          table="organizer_templates"
          objectId={sharingCard.id}
          objectName={sharingCard.name}
          downlineWorkspaces={downlineWorkspaces}
          onClose={() => setSharingCard(null)}
        />
      )}

      {creating && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 px-4 py-8">
          <form onSubmit={createTemplate} className="w-full max-w-md rounded-xl border border-border bg-surface p-5 shadow-lg">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-ink">New organizer</h2>
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
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Description (optional)"
                rows={2}
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
                {saving ? "Creating..." : "Create & open builder"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
