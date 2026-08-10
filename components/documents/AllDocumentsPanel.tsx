"use client";

import { useState } from "react";
import { DocumentList } from "./DocumentList";
import { PreviewPanel } from "./PreviewPanel";
import type { DocumentRow } from "./types";

// Workspace-wide document list for the Document Center hub -- unlike a
// client/engagement's Files tab, rows can belong to any entity, so there's
// no fixed folder scope and every row carries its own entity_type/entity_id.
export function AllDocumentsPanel({
  workspaceId,
  documents,
  entityLabels,
}: {
  workspaceId: string;
  documents: DocumentRow[];
  entityLabels: Map<string, { label: string; href: string }>;
}) {
  const [previewDoc, setPreviewDoc] = useState<DocumentRow | null>(null);

  return (
    <div>
      <DocumentList documents={documents} folders={[]} onPreview={setPreviewDoc} workspaceId={workspaceId} entityLabels={entityLabels} />
      {previewDoc && <PreviewPanel document={previewDoc} onClose={() => setPreviewDoc(null)} />}
    </div>
  );
}
