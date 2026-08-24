"use client";

import { useMemo, useState } from "react";
import { FolderTree } from "./FolderTree";
import { DocumentList } from "./DocumentList";
import { PreviewPanel } from "./PreviewPanel";
import type { DocumentFolderRow, DocumentRow } from "./types";

// A single client/engagement's Files tab already has one fixed folder tree
// (document_folders is scoped to one entity). The workspace-wide Document
// Center spans every entity at once, so there's no single real tree to
// show -- this synthesizes one "virtual" root folder per client/engagement
// that actually has documents or folders, keyed the same way entityLabels
// already is, and nests each entity's real folders (e.g. its per-service
// subfolders) underneath. Selecting a virtual root shows every document for
// that entity regardless of subfolder; selecting a real subfolder narrows
// to just that folder, same as a single-entity Files tab.
const VIRTUAL_PREFIX = "entity:";

export function AllDocumentsPanel({
  workspaceId,
  documents,
  folders,
  entityLabels,
}: {
  workspaceId: string;
  documents: DocumentRow[];
  folders: DocumentFolderRow[];
  entityLabels: Map<string, { label: string; href: string }>;
}) {
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [previewDoc, setPreviewDoc] = useState<DocumentRow | null>(null);

  const { treeFolders, entityRootIdByKey } = useMemo(() => {
    const keys = new Set<string>();
    for (const d of documents) {
      if (d.entity_type && d.entity_id) keys.add(`${d.entity_type}:${d.entity_id}`);
    }
    for (const f of folders) {
      if (f.entity_type && f.entity_id) keys.add(`${f.entity_type}:${f.entity_id}`);
    }

    const rootIdByKey = new Map<string, string>();
    const roots: DocumentFolderRow[] = Array.from(keys)
      .sort((a, b) => (entityLabels.get(a)?.label ?? "").localeCompare(entityLabels.get(b)?.label ?? ""))
      .map((key, i) => {
        const rootId = `${VIRTUAL_PREFIX}${key}`;
        rootIdByKey.set(key, rootId);
        return { id: rootId, name: entityLabels.get(key)?.label ?? "Untitled", parent_folder_id: null, display_order: i };
      });

    // Real folders reparent under their entity's virtual root when they
    // were top-level to begin with; a folder that already has a parent
    // (a sub-subfolder) keeps it -- only the top level needed synthesizing.
    const reparented = folders.map((f) => ({
      ...f,
      parent_folder_id: f.parent_folder_id ?? (f.entity_type && f.entity_id ? (rootIdByKey.get(`${f.entity_type}:${f.entity_id}`) ?? null) : null),
    }));

    return { treeFolders: [...roots, ...reparented], entityRootIdByKey: rootIdByKey };
  }, [documents, folders, entityLabels]);

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const d of documents) {
      if (d.is_archived) continue;
      if (d.folder_id) map.set(d.folder_id, (map.get(d.folder_id) ?? 0) + 1);
      if (d.entity_type && d.entity_id) {
        const rootId = entityRootIdByKey.get(`${d.entity_type}:${d.entity_id}`);
        if (rootId) map.set(rootId, (map.get(rootId) ?? 0) + 1);
      }
    }
    return map;
  }, [documents, entityRootIdByKey]);

  const documentsInScope = useMemo(() => {
    if (!selectedFolderId) return documents;
    if (selectedFolderId.startsWith(VIRTUAL_PREFIX)) {
      const key = selectedFolderId.slice(VIRTUAL_PREFIX.length);
      return documents.filter((d) => d.entity_type && d.entity_id && `${d.entity_type}:${d.entity_id}` === key);
    }
    return documents.filter((d) => d.folder_id === selectedFolderId);
  }, [documents, selectedFolderId]);

  return (
    <div className="flex flex-col gap-4 sm:flex-row">
      <FolderTree folders={treeFolders} selectedId={selectedFolderId} onSelect={setSelectedFolderId} counts={counts} totalCount={documents.length} />
      <div className="flex-1">
        <DocumentList documents={documentsInScope} folders={treeFolders} onPreview={setPreviewDoc} workspaceId={workspaceId} entityLabels={entityLabels} />
      </div>
      {previewDoc && <PreviewPanel document={previewDoc} onClose={() => setPreviewDoc(null)} />}
    </div>
  );
}
