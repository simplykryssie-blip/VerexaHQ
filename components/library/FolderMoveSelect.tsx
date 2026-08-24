"use client";

import { flattenFolderOptions } from "./folderTree";
import type { LibraryFolderRow } from "./types";

// Inline per-item "move to folder" control -- no folders exist yet on a
// fresh workspace, so this renders nothing until at least one has been
// created, instead of showing a dropdown with only "No folder" in it.
export function FolderMoveSelect({
  folders,
  value,
  onChange,
  disabled,
}: {
  folders: LibraryFolderRow[];
  value: string | null;
  onChange: (folderId: string | null) => void;
  disabled?: boolean;
}) {
  if (folders.length === 0) return null;
  const options = flattenFolderOptions(folders);
  return (
    <select
      value={value ?? "__root__"}
      onChange={(e) => onChange(e.target.value === "__root__" ? null : e.target.value)}
      disabled={disabled}
      aria-label="Move to folder"
      className="rounded-lg border border-border bg-surface px-2 py-1 text-xs text-slate focus:border-accent focus:outline-none"
    >
      <option value="__root__">No folder</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
