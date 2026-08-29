"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FolderInput } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { TemplateGallery, type GalleryCard } from "@/components/settings/TemplateGallery";
import { PublishConfirmModal } from "@/components/settings/PublishConfirmModal";
import type { LibraryFolderRow } from "@/components/library/types";
import { slugify } from "@/lib/roleSlug";
import { useToast } from "@/components/Toast";

export type DocumentRequestTemplateCard = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  workspace_id: string | null;
  folder_id: string | null;
  itemCount: number;
  requiredCount: number;
};

export function DocumentRequestLibrary({
  workspaceId,
  templates,
  folders,
}: {
  workspaceId: string;
  templates: DocumentRequestTemplateCard[];
  folders: LibraryFolderRow[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingPublish, setPendingPublish] = useState<{ id: string; name: string } | null>(null);
  const [publishing, setPublishing] = useState(false);

  const cards: GalleryCard[] = templates.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    status: t.status,
    isSystem: !t.workspace_id,
    folder_id: t.folder_id,
    href: `/templates/document-requests/${t.id}`,
    actionLabel: t.workspace_id ? "Edit" : "View",
    badges: [`${t.itemCount} item${t.itemCount === 1 ? "" : "s"}`, `${t.requiredCount} required`],
  }));

  async function moveTemplate(card: GalleryCard, folderId: string | null) {
    const { error } = await supabase.from("document_request_templates").update({ folder_id: folderId }).eq("id", card.id);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    router.refresh();
  }

  async function createTemplate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const base = slugify(name);
    for (let attempt = 0; attempt < 5; attempt++) {
      const slug = attempt === 0 ? base : `${base}-${attempt + 1}`;
      const { data, error } = await supabase
        .from("document_request_templates")
        .insert({ workspace_id: workspaceId, name, slug, status: "draft" })
        .select("id, name")
        .single();
      if (!error && data) {
        setSaving(false);
        setCreating(false);
        setName("");
        setPendingPublish(data as { id: string; name: string });
        return;
      }
      if (error?.code !== "23505") {
        setSaving(false);
        setError(error?.message ?? "Could not create document request checklist.");
        return;
      }
    }
    setSaving(false);
    setError("Could not create checklist -- try a slightly different name.");
  }

  async function deleteTemplate(card: GalleryCard) {
    if (!window.confirm(`Delete "${card.name}"? This can't be undone.`)) return;
    const { error } = await supabase.from("document_request_templates").delete().eq("id", card.id);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    toast.show("Checklist deleted", "success");
    router.refresh();
  }

  return (
    <div>
      <TemplateGallery
        workspaceId={workspaceId}
        itemType="form_template"
        folders={folders}
        cards={cards}
        icon={FolderInput}
        statusTable="document_request_templates"
        searchPlaceholder="Search checklists..."
        emptyMessage="No checklists match."
        createTileLabel="Create new checklist"
        onCreateClick={() => setCreating(true)}
        onDeleteClick={deleteTemplate}
        onMoveClick={moveTemplate}
      />

      {creating && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 px-4 py-8">
          <form onSubmit={createTemplate} className="w-full max-w-md rounded-2xl border border-border bg-surface p-5 shadow-softHover">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-sm font-semibold text-ink">New document request checklist</h2>
              <button type="button" onClick={() => setCreating(false)} className="text-lg text-muted hover:text-ink">
                ×
              </button>
            </div>
            <div className="mt-4 space-y-3">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Name (e.g. Individual Tax Documents)"
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

      {pendingPublish && (
        <PublishConfirmModal
          templateName={pendingPublish.name}
          publishing={publishing}
          onSkip={() => {
            const id = pendingPublish.id;
            setPendingPublish(null);
            router.push(`/templates/document-requests/${id}`);
          }}
          onPublish={async () => {
            setPublishing(true);
            const { error } = await supabase.from("document_request_templates").update({ status: "published" }).eq("id", pendingPublish.id);
            setPublishing(false);
            if (error) {
              toast.show(error.message, "error");
              return;
            }
            const id = pendingPublish.id;
            setPendingPublish(null);
            router.push(`/templates/document-requests/${id}`);
          }}
        />
      )}
    </div>
  );
}
