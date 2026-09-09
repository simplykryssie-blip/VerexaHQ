"use client";

import { useMemo, useState } from "react";
import { Users, Tag } from "lucide-react";
import { FolderTree } from "./FolderTree";
import { DocumentList } from "./DocumentList";
import { PreviewPanel } from "./PreviewPanel";
import type { DocumentFolderRow, DocumentRow } from "./types";

// A single client/engagement's Files tab already has one fixed folder tree
// (document_folders is scoped to one entity). The workspace-wide Document
// Center spans every entity at once, so there's no single real tree to
// show -- this synthesizes a virtual tree instead. Two groupings are
// offered because they answer different questions: "By Client" (a virtual
// root per client/engagement, with each entity's real folders nested
// underneath -- same shape a single-entity Files tab has) for "what does
// this client have on file", and "By Category" (a virtual root per
// `attachments.category` value, flat, spanning every client) for "find
// every engagement letter/W-2/signed 8879 regardless of whose it is" --
// the thing a pure per-client tree can never answer. Tags stay a
// cross-cutting filter (DocumentList) rather than a third tree, since a
// document can carry more than one tag and a tree assumes one parent.
const VIRTUAL_PREFIX = "entity:";
const CATEGORY_PREFIX = "category:";
const UNCATEGORIZED_KEY = "__uncategorized__";

type ViewMode = "client" | "category";

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
  const [viewMode, setViewMode] = useState<ViewMode>("client");
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [previewDoc, setPreviewDoc] = useState<DocumentRow | null>(null);

  function changeViewMode(mode: ViewMode) {
    setViewMode(mode);
    setSelectedFolderId(null);
  }

  const { treeFolders: clientTree, entityRootIdByKey } = useMemo(() => {
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

  const categoryTree = useMemo(() => {
    const categories = Array.from(new Set(documents.map((d) => d.category ?? UNCATEGORIZED_KEY))).sort((a, b) => {
      if (a === UNCATEGORIZED_KEY) return 1;
      if (b === UNCATEGORIZED_KEY) return -1;
      return a.localeCompare(b);
    });
    return categories.map(
      (key, i): DocumentFolderRow => ({
        id: `${CATEGORY_PREFIX}${key}`,
        name: key === UNCATEGORIZED_KEY ? "Uncategorized" : key,
        parent_folder_id: null,
        display_order: i,
      })
    );
  }, [documents]);

  const treeFolders = viewMode === "client" ? clientTree : categoryTree;

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const d of documents) {
      if (d.is_archived) continue;
      if (viewMode === "client") {
        if (d.folder_id) map.set(d.folder_id, (map.get(d.folder_id) ?? 0) + 1);
        if (d.entity_type && d.entity_id) {
          const rootId = entityRootIdByKey.get(`${d.entity_type}:${d.entity_id}`);
          if (rootId) map.set(rootId, (map.get(rootId) ?? 0) + 1);
        }
      } else {
        const categoryId = `${CATEGORY_PREFIX}${d.category ?? UNCATEGORIZED_KEY}`;
        map.set(categoryId, (map.get(categoryId) ?? 0) + 1);
      }
    }
    return map;
  }, [documents, entityRootIdByKey, viewMode]);

  const documentsInScope = useMemo(() => {
    if (!selectedFolderId) return documents;
    if (selectedFolderId.startsWith(VIRTUAL_PREFIX)) {
      const key = selectedFolderId.slice(VIRTUAL_PREFIX.length);
      return documents.filter((d) => d.entity_type && d.entity_id && `${d.entity_type}:${d.entity_id}` === key);
    }
    if (selectedFolderId.startsWith(CATEGORY_PREFIX)) {
      const key = selectedFolderId.slice(CATEGORY_PREFIX.length);
      return documents.filter((d) => (d.category ?? UNCATEGORIZED_KEY) === key);
    }
    return documents.filter((d) => d.folder_id === selectedFolderId);
  }, [documents, selectedFolderId]);

  return (
    <div className="flex flex-col gap-4 sm:flex-row">
      <div className="w-full shrink-0 sm:w-56">
        <div className="mb-2 flex gap-1 rounded-lg bg-surfaceMuted p-1 text-xs font-medium">
          <button
            type="button"
            onClick={() => changeViewMode("client")}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 transition ${
              viewMode === "client" ? "bg-surface text-ink shadow-soft" : "text-muted hover:text-ink"
            }`}
          >
            <Users size={12} aria-hidden="true" /> By client
          </button>
          <button
            type="button"
            onClick={() => changeViewMode("category")}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 transition ${
              viewMode === "category" ? "bg-surface text-ink shadow-soft" : "text-muted hover:text-ink"
            }`}
          >
            <Tag size={12} aria-hidden="true" /> By category
          </button>
        </div>
        <FolderTree folders={treeFolders} selectedId={selectedFolderId} onSelect={setSelectedFolderId} counts={counts} totalCount={documents.length} />
      </div>
      <div className="flex-1">
        <DocumentList documents={documentsInScope} folders={treeFolders} onPreview={setPreviewDoc} workspaceId={workspaceId} entityLabels={entityLabels} />
      </div>
      {previewDoc && <PreviewPanel document={previewDoc} onClose={() => setPreviewDoc(null)} />}
    </div>
  );
}
