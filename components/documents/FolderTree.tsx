"use client";

import { Folder, FolderOpen } from "lucide-react";
import type { DocumentFolderRow } from "./types";

function buildTree(folders: DocumentFolderRow[], parentId: string | null): DocumentFolderRow[] {
  return folders.filter((f) => f.parent_folder_id === parentId).sort((a, b) => a.display_order - b.display_order);
}

function FolderNode({
  folder,
  folders,
  selectedId,
  onSelect,
  depth,
  counts,
}: {
  folder: DocumentFolderRow;
  folders: DocumentFolderRow[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  depth: number;
  counts: Map<string, number>;
}) {
  const children = buildTree(folders, folder.id);
  const isSelected = selectedId === folder.id;
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(folder.id)}
        aria-current={isSelected}
        style={{ paddingLeft: `${depth * 14 + 8}px` }}
        className={`flex w-full items-center gap-2 rounded-lg py-1.5 pr-2 text-left text-sm transition ${
          isSelected ? "bg-accentSoft text-accent" : "text-slate hover:bg-surfaceMuted"
        }`}
      >
        {isSelected ? <FolderOpen size={14} aria-hidden="true" /> : <Folder size={14} aria-hidden="true" />}
        <span className="truncate">{folder.name}</span>
        {counts.has(folder.id) && <span className="ml-auto text-xs text-muted">{counts.get(folder.id)}</span>}
      </button>
      {children.length > 0 && (
        <ul>
          {children.map((child) => (
            <FolderNode key={child.id} folder={child} folders={folders} selectedId={selectedId} onSelect={onSelect} depth={depth + 1} counts={counts} />
          ))}
        </ul>
      )}
    </li>
  );
}

export function FolderTree({
  folders,
  selectedId,
  onSelect,
  counts,
  totalCount,
}: {
  folders: DocumentFolderRow[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  counts: Map<string, number>;
  totalCount: number;
}) {
  const roots = buildTree(folders, null);

  return (
    <nav aria-label="Document folders" className="w-full shrink-0 border-b border-border pb-3 sm:w-56 sm:border-b-0 sm:border-r sm:pb-0 sm:pr-3">
      <button
        type="button"
        onClick={() => onSelect(null)}
        aria-current={selectedId === null}
        className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm font-medium transition ${
          selectedId === null ? "bg-accentSoft text-accent" : "text-slate hover:bg-surfaceMuted"
        }`}
      >
        All Documents
        <span className="ml-auto text-xs text-muted">{totalCount}</span>
      </button>
      {roots.length > 0 && (
        <ul className="mt-1">
          {roots.map((folder) => (
            <FolderNode key={folder.id} folder={folder} folders={folders} selectedId={selectedId} onSelect={onSelect} depth={0} counts={counts} />
          ))}
        </ul>
      )}
    </nav>
  );
}
