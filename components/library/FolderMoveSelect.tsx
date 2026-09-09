"use client";

import { ChevronDown } from "lucide-react";
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
    <div className="relative inline-flex">
      <select
        value={value ?? "__root__"}
        onChange={(e) => onChange(e.target.value === "__root__" ? null : e.target.value)}
        disabled={disabled}
        aria-label="Move to folder"
        className="appearance-none rounded-lg border border-border bg-surface py-1.5 pl-3 pr-7 text-xs font-medium text-slate transition hover:border-accent/50 focus:border-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <option value="__root__">No folder</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown size={13} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-muted" />
    </div>
  );
}
