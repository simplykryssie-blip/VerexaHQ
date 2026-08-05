"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Star, Archive, ArchiveRestore, Trash2, Pencil, RotateCw, Lock, FileText } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import { EmptyState } from "@/components/EmptyState";
import type { DocumentFolderRow, DocumentRow } from "./types";

function formatSize(bytes: number | null) {
  if (!bytes) return "--";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DocumentList({
  documents,
  folders,
  onPreview,
  workspaceId,
  entityType,
  entityId,
}: {
  documents: DocumentRow[];
  folders: DocumentFolderRow[];
  onPreview: (doc: DocumentRow) => void;
  workspaceId: string;
  entityType: "client" | "engagement";
  entityId: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const allTags = useMemo(() => Array.from(new Set(documents.flatMap((d) => d.tags ?? []))), [documents]);

  const visible = documents.filter((d) => {
    if (d.is_archived !== showArchived) return false;
    if (tagFilter && !(d.tags ?? []).includes(tagFilter)) return false;
    if (search && !d.file_name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function bulkUpdate(patch: { is_favorite?: boolean; is_archived?: boolean; folder_id?: string | null }, successMessage: string) {
    const { error } = await supabase.from("attachments").update(patch).in("id", Array.from(selected));
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    toast.show(successMessage, "success");
    setSelected(new Set());
    router.refresh();
  }

  async function bulkDelete() {
    if (!window.confirm(`Delete ${selected.size} document${selected.size === 1 ? "" : "s"}? This can be restored from Archive.`)) return;
    await bulkUpdate({ is_archived: true }, "Moved to archive");
  }

  async function toggleFavorite(doc: DocumentRow) {
    await supabase.from("attachments").update({ is_favorite: !doc.is_favorite }).eq("id", doc.id);
    router.refresh();
  }

  async function saveRename(doc: DocumentRow) {
    if (!renameValue.trim() || renameValue === doc.file_name) {
      setRenamingId(null);
      return;
    }
    const { error } = await supabase.from("attachments").update({ file_name: renameValue.trim() }).eq("id", doc.id);
    setRenamingId(null);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    toast.show("Renamed", "success");
    router.refresh();
  }

  async function replaceVersion(doc: DocumentRow, file: File) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const path = `${workspaceId}/${entityId}/${Date.now()}-${file.name}`;
    const { error: uploadErr } = await supabase.storage.from("client-documents").upload(path, file);
    if (uploadErr) {
      toast.show(uploadErr.message, "error");
      return;
    }
    const { error: insertErr } = await supabase.from("attachments").insert({
      workspace_id: workspaceId,
      entity_type: entityType,
      entity_id: entityId,
      folder_id: doc.folder_id,
      category: doc.category,
      file_name: file.name,
      storage_path: path,
      mime_type: file.type || null,
      file_size_bytes: file.size,
      uploaded_by: user?.id,
      replaces_attachment_id: doc.id,
      version: (doc.version ?? 1) + 1,
    });
    if (insertErr) {
      toast.show(insertErr.message, "error");
      return;
    }
    await supabase.from("attachments").update({ is_latest_version: false }).eq("id", doc.id);
    toast.show("New version uploaded", "success");
    router.refresh();
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 pb-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search documents..."
          aria-label="Search documents"
          className="w-56 rounded-lg border border-border px-3 py-1.5 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />
        {allTags.map((tag) => (
          <button
            key={tag}
            type="button"
            onClick={() => setTagFilter(tagFilter === tag ? null : tag)}
            className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
              tagFilter === tag ? "bg-accent text-white" : "bg-surfaceMuted text-muted hover:text-ink"
            }`}
          >
            {tag}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setShowArchived((v) => !v)}
          className={`ml-auto rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
            showArchived ? "border-accent bg-accentSoft text-accent" : "border-border text-muted hover:text-ink"
          }`}
        >
          {showArchived ? "Viewing archived" : "View archived"}
        </button>
      </div>

      {selected.size > 0 && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-border bg-surfaceMuted px-3 py-2 text-sm">
          <span className="text-muted">{selected.size} selected</span>
          <button type="button" onClick={() => bulkUpdate({ is_favorite: true }, "Added to favorites")} aria-label="Favorite selected" className="rounded p-1.5 text-muted hover:text-ink">
            <Star size={14} />
          </button>
          {showArchived ? (
            <button type="button" onClick={() => bulkUpdate({ is_archived: false }, "Restored")} aria-label="Restore selected" className="rounded p-1.5 text-muted hover:text-ink">
              <ArchiveRestore size={14} />
            </button>
          ) : (
            <button type="button" onClick={() => bulkUpdate({ is_archived: true }, "Archived")} aria-label="Archive selected" className="rounded p-1.5 text-muted hover:text-ink">
              <Archive size={14} />
            </button>
          )}
          <select
            aria-label="Move selected to folder"
            defaultValue=""
            onChange={(e) => {
              if (e.target.value === "") return;
              bulkUpdate({ folder_id: e.target.value === "__root__" ? null : e.target.value }, "Moved");
            }}
            className="rounded-lg border border-border px-2 py-1 text-xs"
          >
            <option value="" disabled>
              Move to...
            </option>
            <option value="__root__">No folder</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
          <button type="button" onClick={bulkDelete} aria-label="Delete selected" className="ml-auto rounded p-1.5 text-danger hover:bg-red-50">
            <Trash2 size={14} />
          </button>
        </div>
      )}

      {visible.length === 0 ? (
        <EmptyState message={showArchived ? "No archived documents." : "No documents here yet."} />
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
          {visible.map((doc) => (
            <li key={doc.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <input
                type="checkbox"
                checked={selected.has(doc.id)}
                onChange={() => toggleSelect(doc.id)}
                aria-label={`Select ${doc.file_name}`}
                className="h-4 w-4 rounded border-border"
              />
              <FileText size={16} className="shrink-0 text-muted" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                {renamingId === doc.id ? (
                  <input
                    autoFocus
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={() => saveRename(doc)}
                    onKeyDown={(e) => e.key === "Enter" && saveRename(doc)}
                    className="w-full rounded border border-accent px-1 text-sm"
                  />
                ) : (
                  <button type="button" onClick={() => onPreview(doc)} className="truncate text-left font-medium text-slate hover:text-accent hover:underline">
                    {doc.file_name}
                  </button>
                )}
                <div className="mt-0.5 flex items-center gap-2 text-xs text-muted">
                  {doc.category && <span className="rounded bg-surfaceMuted px-1.5 py-0.5 text-slate">{doc.category}</span>}
                  {(doc.version ?? 1) > 1 && <span>v{doc.version}</span>}
                  <span>{formatSize(doc.file_size_bytes)}</span>
                  <span>{new Date(doc.created_at).toLocaleDateString()}</span>
                  <span>{doc.uploaded_by?.display_name ?? "Unknown"}</span>
                  {doc.visibility === "client_visible" && <span className="text-accent">Client visible</span>}
                  {doc.is_locked && (
                    <span className="inline-flex items-center gap-0.5 text-warning">
                      <Lock size={10} /> Locked
                    </span>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => toggleFavorite(doc)}
                aria-label={doc.is_favorite ? "Remove from favorites" : "Add to favorites"}
                className={doc.is_favorite ? "text-accent" : "text-muted hover:text-ink"}
              >
                <Star size={16} fill={doc.is_favorite ? "currentColor" : "none"} />
              </button>
              {!doc.is_locked && (
                <>
                  <label className="cursor-pointer text-muted hover:text-ink" title="Upload a new version">
                    <RotateCw size={16} />
                    <input
                      type="file"
                      className="sr-only"
                      onChange={(e) => e.target.files?.[0] && replaceVersion(doc, e.target.files[0])}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setRenamingId(doc.id);
                      setRenameValue(doc.file_name);
                    }}
                    aria-label={`Rename ${doc.file_name}`}
                    className="text-muted hover:text-ink"
                  >
                    <Pencil size={16} />
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
