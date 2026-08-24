"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Folder, FolderOpen, FolderPlus, Pencil, Trash2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import { childrenOf } from "./folderTree";
import type { LibraryFolderRow, LibraryItemType } from "./types";

function FolderRow({
  folder,
  folders,
  depth,
  selectedId,
  onSelect,
  canManage,
  counts,
  onRename,
  onDelete,
}: {
  folder: LibraryFolderRow;
  folders: LibraryFolderRow[];
  depth: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  canManage: boolean;
  counts: Map<string, number>;
  onRename: (folder: LibraryFolderRow, name: string) => void;
  onDelete: (folder: LibraryFolderRow) => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(folder.name);
  const isSelected = selectedId === folder.id;
  const children = childrenOf(folders, folder.id);

  function commitRename() {
    const trimmed = draft.trim();
    setRenaming(false);
    if (trimmed && trimmed !== folder.name) onRename(folder, trimmed);
    else setDraft(folder.name);
  }

  return (
    <li>
      <div
        style={{ paddingLeft: `${depth * 14 + 8}px` }}
        className={`group flex items-center gap-1.5 rounded-lg pr-1.5 text-sm transition ${
          isSelected ? "bg-accentSoft text-accent" : "text-slate hover:bg-surfaceMuted"
        }`}
      >
        {renaming ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") {
                setDraft(folder.name);
                setRenaming(false);
              }
            }}
            className="my-1 min-w-0 flex-1 rounded border border-accent bg-surface px-1.5 py-0.5 text-sm focus:outline-none"
          />
        ) : (
          <button type="button" onClick={() => onSelect(folder.id)} className="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left">
            {isSelected ? <FolderOpen size={14} aria-hidden="true" /> : <Folder size={14} aria-hidden="true" />}
            <span className="truncate">{folder.name}</span>
            {counts.has(folder.id) && <span className="ml-auto shrink-0 text-xs text-muted">{counts.get(folder.id)}</span>}
          </button>
        )}
        {canManage && !renaming && (
          <div className="hidden shrink-0 items-center gap-0.5 group-hover:flex">
            <button type="button" onClick={() => setRenaming(true)} aria-label={`Rename ${folder.name}`} className="rounded p-1 text-muted hover:text-ink">
              <Pencil size={11} />
            </button>
            <button type="button" onClick={() => onDelete(folder)} aria-label={`Delete ${folder.name}`} className="rounded p-1 text-muted hover:text-danger">
              <Trash2 size={11} />
            </button>
          </div>
        )}
      </div>
      {children.length > 0 && (
        <ul>
          {children.map((child) => (
            <FolderRow
              key={child.id}
              folder={child}
              folders={folders}
              depth={depth + 1}
              selectedId={selectedId}
              onSelect={onSelect}
              canManage={canManage}
              counts={counts}
              onRename={onRename}
              onDelete={onDelete}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

// Shared, generic folder sidebar for the five workspace libraries
// (Pipelines, Workflows, Websites, Email & SMS Templates, Form Templates).
// Folders always sort alphabetically -- there's no manual reordering, by
// design. "New folder" creates inside whichever folder is currently
// selected, so subfolders fall out of normal navigation instead of needing
// a separate "add subfolder" control.
export function LibraryFolderPane({
  workspaceId,
  itemType,
  canManage,
  folders,
  selectedFolderId,
  onSelect,
  totalCount,
  counts,
  rootLabel,
}: {
  workspaceId: string;
  itemType: LibraryItemType;
  canManage: boolean;
  folders: LibraryFolderRow[];
  selectedFolderId: string | null;
  onSelect: (id: string | null) => void;
  totalCount: number;
  counts: Map<string, number>;
  rootLabel: string;
}) {
  const supabase = createClient();
  const router = useRouter();
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);

  const roots = childrenOf(folders, null);

  async function createFolder(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = newName.trim();
    if (!trimmed) return;
    setSaving(true);
    const { error } = await supabase
      .from("library_folders")
      .insert({ workspace_id: workspaceId, item_type: itemType, parent_folder_id: selectedFolderId, name: trimmed });
    setSaving(false);
    if (error) {
      toast.show(error.code === "23505" ? "A folder with that name already exists here." : error.message, "error");
      return;
    }
    setCreating(false);
    setNewName("");
    router.refresh();
  }

  async function renameFolder(folder: LibraryFolderRow, name: string) {
    const { error } = await supabase.from("library_folders").update({ name }).eq("id", folder.id);
    if (error) {
      toast.show(error.code === "23505" ? "A folder with that name already exists here." : error.message, "error");
      return;
    }
    router.refresh();
  }

  async function deleteFolder(folder: LibraryFolderRow) {
    if (!window.confirm(`Delete "${folder.name}"? Any subfolders go with it. Items inside just move back to the top level -- nothing is deleted.`)) return;
    if (selectedFolderId === folder.id) onSelect(null);
    const { error } = await supabase.from("library_folders").delete().eq("id", folder.id);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    router.refresh();
  }

  return (
    <nav aria-label="Folders" className="w-full shrink-0 border-b border-border pb-3 sm:w-56 sm:border-b-0 sm:border-r sm:pb-0 sm:pr-3">
      <button
        type="button"
        onClick={() => onSelect(null)}
        aria-current={selectedFolderId === null}
        className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm font-medium transition ${
          selectedFolderId === null ? "bg-accentSoft text-accent" : "text-slate hover:bg-surfaceMuted"
        }`}
      >
        {rootLabel}
        <span className="ml-auto text-xs text-muted">{totalCount}</span>
      </button>

      {roots.length > 0 && (
        <ul className="mt-1">
          {roots.map((folder) => (
            <FolderRow
              key={folder.id}
              folder={folder}
              folders={folders}
              depth={0}
              selectedId={selectedFolderId}
              onSelect={onSelect}
              canManage={canManage}
              counts={counts}
              onRename={renameFolder}
              onDelete={deleteFolder}
            />
          ))}
        </ul>
      )}

      {canManage && (
        <div className="mt-2">
          {creating ? (
            <form onSubmit={createFolder} className="flex items-center gap-1">
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onBlur={() => {
                  if (!newName.trim()) setCreating(false);
                }}
                onKeyDown={(e) => e.key === "Escape" && setCreating(false)}
                placeholder="Folder name"
                className="min-w-0 flex-1 rounded-lg border border-border px-2 py-1 text-sm focus:border-accent focus:outline-none"
              />
              <button type="submit" disabled={saving} aria-label="Create folder" className="shrink-0 rounded p-1 text-accent hover:bg-accentSoft disabled:opacity-50">
                <Check size={14} />
              </button>
              <button type="button" onClick={() => setCreating(false)} aria-label="Cancel" className="shrink-0 rounded p-1 text-muted hover:text-ink">
                <X size={14} />
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-muted hover:bg-surfaceMuted hover:text-ink"
            >
              <FolderPlus size={14} />
              New folder{selectedFolderId ? " here" : ""}
            </button>
          )}
        </div>
      )}
    </nav>
  );
}
