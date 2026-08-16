"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardList, FileSignature, Import } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { TemplateGallery, type GalleryCard } from "@/components/settings/TemplateGallery";
import { JotFormImportModal } from "@/components/settings/organizer-builder/JotFormImportModal";
import { slugify } from "@/lib/roleSlug";
import { useToast } from "@/components/Toast";
import type { OrganizerCard, EngagementLetterCard } from "@/components/settings/formTemplateTypes";

// Organizer and engagement-letter templates are still two different tables
// (see the migration notes on combined templates), but staff never think of
// them as two different systems -- a combined, signable template is just an
// organizer template with a rich_text block and a signature field. One flat
// list under Form Templates, distinguished by a type badge, matches that.
export function FormTemplateLibraryList({
  workspaceId,
  organizerTemplates,
  engagementLetterTemplates,
  isJotformConnected,
}: {
  workspaceId: string;
  organizerTemplates: OrganizerCard[];
  engagementLetterTemplates: EngagementLetterCard[];
  isJotformConnected: boolean;
}) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [creatingOrganizer, setCreatingOrganizer] = useState(false);
  const [creatingLetter, setCreatingLetter] = useState(false);
  const [importing, setImporting] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const organizerCards: GalleryCard[] = organizerTemplates.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    status: t.status,
    isSystem: !t.workspace_id,
    href: `/templates/organizers/${t.id}`,
    actionLabel: t.workspace_id ? "Edit" : "View",
    statusTable: "organizer_templates",
    icon: ClipboardList,
    badges: [
      t.hasSignature ? "Includes signature" : null,
      `${t.topLevelFieldCount} field${t.topLevelFieldCount === 1 ? "" : "s"}`,
      t.totalFieldCount !== t.topLevelFieldCount ? `${t.totalFieldCount} total incl. repeats` : null,
    ].filter((b): b is string => Boolean(b)),
  }));

  const letterCards: GalleryCard[] = engagementLetterTemplates.map((t) => ({
    id: t.id,
    name: t.name,
    status: t.status,
    isSystem: !t.workspace_id,
    href: `/templates/engagement-letters/${t.id}`,
    actionLabel: t.workspace_id ? "Edit" : "View",
    statusTable: "engagement_letter_templates",
    icon: FileSignature,
    badges: [
      ...(t.requires_signature ? ["Requires signature"] : []),
      `${t.merge_field_count} merge field${t.merge_field_count === 1 ? "" : "s"}`,
    ],
  }));

  const cards = [...organizerCards, ...letterCards].sort((a, b) => a.name.localeCompare(b.name));

  async function createOrganizer(e: React.FormEvent) {
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
        setError(error?.message ?? "Could not create form template.");
        return;
      }
    }
    setSaving(false);
    setError("Could not create form template -- try a slightly different name.");
  }

  async function createLetter(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const base = slugify(name);
    for (let attempt = 0; attempt < 5; attempt++) {
      const slug = attempt === 0 ? base : `${base}-${attempt + 1}`;
      const { data, error } = await supabase
        .from("engagement_letter_templates")
        .insert({ workspace_id: workspaceId, name, slug, body_html: "<p></p>", status: "draft" })
        .select("id")
        .single();
      if (!error && data) {
        setSaving(false);
        router.push(`/templates/engagement-letters/${data.id}`);
        return;
      }
      if (error?.code !== "23505") {
        setSaving(false);
        setError(error?.message ?? "Could not create engagement letter.");
        return;
      }
    }
    setSaving(false);
    setError("Could not create engagement letter -- try a slightly different name.");
  }

  async function deleteTemplate(card: GalleryCard) {
    if (card.statusTable === "organizer_templates") {
      if (!window.confirm(`Delete "${card.name}"? This can't be undone.`)) return;
      const { error } = await supabase.from("organizer_templates").delete().eq("id", card.id);
      if (error) {
        // organizer_responses.organizer_template_id is a NO ACTION foreign key --
        // the database itself refuses this delete if a client has ever answered
        // this template, rather than silently orphaning their real answers.
        toast.show(
          error.code === "23503"
            ? "Can't delete -- a client has already submitted answers for this template. Archive it instead."
            : error.message,
          "error"
        );
        return;
      }
      toast.show("Template deleted", "success");
      router.refresh();
      return;
    }

    // Unlike organizer responses, signatures already on file for an
    // engagement letter aren't protected by the database itself -- deleting
    // the template would cascade-delete them. Check first so we never touch
    // a real client's signature.
    const { count } = await supabase
      .from("engagement_letter_public_signatures")
      .select("id", { count: "exact", head: true })
      .eq("engagement_letter_template_id", card.id);
    if (count && count > 0) {
      toast.show(`Can't delete -- ${count} client signature${count === 1 ? "" : "s"} are on file for this letter.`, "error");
      return;
    }

    if (!window.confirm(`Delete "${card.name}"? This can't be undone.`)) return;
    const { error } = await supabase.from("engagement_letter_templates").delete().eq("id", card.id);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    toast.show("Engagement letter deleted", "success");
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
        searchPlaceholder="Search form templates..."
        emptyMessage="No form templates match."
        createActions={[
          { label: "New form template", onClick: () => setCreatingOrganizer(true), primary: true },
          { label: "New engagement letter only", onClick: () => setCreatingLetter(true) },
        ]}
        onDeleteClick={deleteTemplate}
      />

      {creatingOrganizer && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4">
          <form onSubmit={createOrganizer} className="w-full max-w-md rounded-xl border border-border bg-surface p-5 shadow-lg">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-ink">New form template</h2>
              <button type="button" onClick={() => setCreatingOrganizer(false)} className="text-lg text-muted hover:text-ink">
                ×
              </button>
            </div>
            <p className="mt-1 text-xs text-muted">
              Intake questions, static terms/legal text, and a signature can all live in the same linear form -- add whichever pieces you need in
              the builder.
            </p>
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
              <button type="button" onClick={() => setCreatingOrganizer(false)} className="rounded-lg px-3 py-1.5 text-sm text-slate hover:bg-surfaceMuted">
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

      {creatingLetter && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4">
          <form onSubmit={createLetter} className="w-full max-w-md rounded-xl border border-border bg-surface p-5 shadow-lg">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-ink">New engagement letter</h2>
              <button type="button" onClick={() => setCreatingLetter(false)} className="text-lg text-muted hover:text-ink">
                ×
              </button>
            </div>
            <p className="mt-1 text-xs text-muted">A document to sign with no intake questions attached. Most firms want a form template instead.</p>
            <div className="mt-4 space-y-3">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Name"
                required
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
              {error && <p className="text-sm text-danger">{error}</p>}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setCreatingLetter(false)} className="rounded-lg px-3 py-1.5 text-sm text-slate hover:bg-surfaceMuted">
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
