"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import { EmptyState } from "@/components/EmptyState";
import { TemplateStatusCycle } from "@/components/settings/TemplateStatusCycle";
import { LibraryFolderPane } from "@/components/library/LibraryFolderPane";
import { FolderMoveSelect } from "@/components/library/FolderMoveSelect";
import type { LibraryFolderRow } from "@/components/library/types";

export type WebsiteCard = { id: string; name: string; slug: string; status: string; folder_id: string | null; page_count: number };

function slugify(name: string) {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "site"
  );
}

export function WebsiteLibrary({
  workspaceId,
  workspaceSlug,
  websites,
  folders,
  canManage,
}: {
  workspaceId: string;
  workspaceSlug: string;
  websites: WebsiteCard[];
  folders: LibraryFolderRow[];
  canManage: boolean;
}) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);

  const visibleWebsites = useMemo(
    () => (selectedFolderId === null ? websites : websites.filter((w) => w.folder_id === selectedFolderId)),
    [websites, selectedFolderId]
  );

  const folderCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const w of websites) {
      if (w.folder_id) map.set(w.folder_id, (map.get(w.folder_id) ?? 0) + 1);
    }
    return map;
  }, [websites]);

  async function moveWebsite(id: string, folderId: string | null) {
    const { error } = await supabase.from("site_websites").update({ folder_id: folderId }).eq("id", id);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    router.refresh();
  }

  async function createWebsite(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("A website name is required.");
      return;
    }
    setSaving(true);
    setError(null);
    const { data, error } = await supabase
      .from("site_websites")
      .insert({ workspace_id: workspaceId, name: trimmed, slug: slugify(trimmed) })
      .select("id")
      .single();
    setSaving(false);
    if (error || !data) {
      setError(error?.message ?? "Could not create website.");
      return;
    }
    router.push(`/websites/${data.id}`);
  }

  async function deleteWebsite(id: string) {
    if (!confirm("Delete this website? All its pages and funnels will be deleted too. This can't be undone.")) return;
    setDeletingId(id);
    const { error } = await supabase.from("site_websites").delete().eq("id", id);
    setDeletingId(null);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4 sm:flex-row">
      <LibraryFolderPane
        workspaceId={workspaceId}
        itemType="website"
        canManage={canManage}
        folders={folders}
        selectedFolderId={selectedFolderId}
        onSelect={setSelectedFolderId}
        totalCount={websites.length}
        counts={folderCounts}
        rootLabel="All Websites"
      />
      <div className="min-w-0 flex-1">
        {canManage && (
          <div className="flex justify-end">
            <button type="button" onClick={() => setCreating(true)} className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent/90">
              + New website
            </button>
          </div>
        )}

        {creating && (
          <form onSubmit={createWebsite} className="mt-4 flex items-end gap-2 rounded-2xl border border-border bg-surface p-4 shadow-soft">
            <label className="flex-1 text-xs font-medium uppercase tracking-wide text-muted">
              Website name
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Main Website"
                className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </label>
            <button type="submit" disabled={saving} className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white disabled:opacity-60">
              {saving ? "Creating..." : "Create"}
            </button>
            <button
              type="button"
              onClick={() => {
                setCreating(false);
                setName("");
                setError(null);
              }}
              className="rounded-lg border border-border px-3 py-2 text-sm font-medium text-slate hover:border-accent hover:text-ink"
            >
              Cancel
            </button>
          </form>
        )}
        {error && <p className="mt-2 text-sm text-danger">{error}</p>}

        <div className="mt-4">
          {visibleWebsites.length === 0 ? (
            <EmptyState message={websites.length === 0 ? "No websites yet -- create one to start building your public site." : "No websites in this folder."} />
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {visibleWebsites.map((w) => (
                <div key={w.id} className="flex flex-col rounded-2xl border border-border bg-surface p-4 shadow-soft">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-semibold text-ink">{w.name}</h3>
                    {canManage && (
                      <button
                        type="button"
                        onClick={() => deleteWebsite(w.id)}
                        disabled={deletingId === w.id}
                        className="shrink-0 rounded p-1 text-muted hover:text-danger disabled:opacity-60"
                        aria-label="Delete website"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                  <p className="mt-1 truncate text-xs text-muted">/site/{workspaceSlug}/{w.slug}</p>
                  <p className="mt-1 text-xs text-muted">
                    {w.page_count} page{w.page_count === 1 ? "" : "s"}
                  </p>
                  <div className="mt-3">
                    {canManage ? (
                      <TemplateStatusCycle table="site_websites" id={w.id} status={w.status} />
                    ) : (
                      <span className="rounded-full bg-surfaceMuted px-2.5 py-1 text-xs font-medium capitalize text-muted">{w.status}</span>
                    )}
                  </div>
                  {canManage && (
                    <div className="mt-2">
                      <FolderMoveSelect folders={folders} value={w.folder_id} onChange={(folderId) => moveWebsite(w.id, folderId)} />
                    </div>
                  )}
                  <Link
                    href={`/websites/${w.id}`}
                    className="mt-4 inline-flex items-center justify-center rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-slate hover:border-accent hover:text-ink"
                  >
                    {canManage ? "Manage" : "View"}
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
