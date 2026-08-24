import type { LibraryFolderRow } from "./types";

export function childrenOf(folders: LibraryFolderRow[], parentId: string | null): LibraryFolderRow[] {
  return folders.filter((f) => f.parent_folder_id === parentId).sort((a, b) => a.name.localeCompare(b.name));
}

// Depth-first, alphabetical-at-every-level flattening for a "Move to
// folder" <select> -- same traversal order the sidebar tree renders in, so
// the dropdown's indentation matches what staff already see in the pane.
export function flattenFolderOptions(folders: LibraryFolderRow[], parentId: string | null = null, depth = 0): { id: string; label: string }[] {
  const result: { id: string; label: string }[] = [];
  for (const folder of childrenOf(folders, parentId)) {
    result.push({ id: folder.id, label: `${"—  ".repeat(depth)}${folder.name}` });
    result.push(...flattenFolderOptions(folders, folder.id, depth + 1));
  }
  return result;
}
