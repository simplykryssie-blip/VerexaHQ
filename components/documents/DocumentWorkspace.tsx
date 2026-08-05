"use client";

import { useMemo, useState } from "react";
import { FolderTree } from "./FolderTree";
import { DocumentList } from "./DocumentList";
import { PreviewPanel } from "./PreviewPanel";
import { UploadZone } from "./UploadZone";
import { RequestsPanel } from "./RequestsPanel";
import { SignaturesPanel } from "./SignaturesPanel";
import { EmptyState } from "@/components/EmptyState";
import type {
  ActivityRow,
  Audience,
  DocumentFolderRow,
  DocumentRequestRow,
  DocumentRequestTemplateOption,
  DocumentRow,
  EntityType,
  SignatureRequestRow,
} from "./types";

const TABS = ["Overview", "Files", "Requests", "Signatures", "Activity"] as const;
type Tab = (typeof TABS)[number];

export function DocumentWorkspace({
  workspaceId,
  entityType,
  entityId,
  folders,
  documents,
  requests,
  requestTemplates,
  signatureRequests,
  activity,
  audience = "staff",
}: {
  workspaceId: string;
  entityType: EntityType;
  entityId: string;
  folders: DocumentFolderRow[];
  documents: DocumentRow[];
  requests: DocumentRequestRow[];
  requestTemplates: DocumentRequestTemplateOption[];
  signatureRequests: SignatureRequestRow[];
  activity: ActivityRow[];
  audience?: Audience;
}) {
  const [tab, setTab] = useState<Tab>("Overview");
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [previewDoc, setPreviewDoc] = useState<DocumentRow | null>(null);

  const activeDocuments = documents.filter((d) => !d.is_archived);
  const folderCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const d of activeDocuments) {
      if (d.folder_id) counts.set(d.folder_id, (counts.get(d.folder_id) ?? 0) + 1);
    }
    return counts;
  }, [activeDocuments]);

  const documentsInScope = selectedFolderId ? documents.filter((d) => d.folder_id === selectedFolderId) : documents;

  const pendingRequests = requests.filter((r) => r.status === "open");
  const pendingSignatures = signatureRequests.filter((r) => r.status === "pending");
  const recentUploads = [...activeDocuments].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 5);

  return (
    <div>
      <nav className="flex gap-1 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition ${
              tab === t ? "border-accent text-accent" : "border-transparent text-muted hover:text-ink"
            }`}
          >
            {t}
            {t === "Requests" && pendingRequests.length > 0 && (
              <span className="ml-1.5 rounded-full bg-accentSoft px-1.5 py-0.5 text-[10px] text-accent">{pendingRequests.length}</span>
            )}
            {t === "Signatures" && pendingSignatures.length > 0 && (
              <span className="ml-1.5 rounded-full bg-accentSoft px-1.5 py-0.5 text-[10px] text-accent">{pendingSignatures.length}</span>
            )}
          </button>
        ))}
      </nav>

      <div className="pt-4">
        {tab === "Overview" && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-border bg-surface p-4">
              <p className="text-xs uppercase tracking-wide text-muted">Documents</p>
              <p className="mt-1 text-2xl font-semibold text-ink">{activeDocuments.length}</p>
            </div>
            <div className="rounded-xl border border-border bg-surface p-4">
              <p className="text-xs uppercase tracking-wide text-muted">Pending Requests</p>
              <p className="mt-1 text-2xl font-semibold text-ink">{pendingRequests.length}</p>
            </div>
            <div className="rounded-xl border border-border bg-surface p-4">
              <p className="text-xs uppercase tracking-wide text-muted">Pending Signatures</p>
              <p className="mt-1 text-2xl font-semibold text-ink">{pendingSignatures.length}</p>
            </div>
            <div className="rounded-xl border border-border bg-surface p-4 sm:col-span-2">
              <p className="text-xs uppercase tracking-wide text-muted">Recent uploads</p>
              {recentUploads.length === 0 ? (
                <p className="mt-2 text-sm text-muted">No documents uploaded yet.</p>
              ) : (
                <ul className="mt-2 space-y-1.5">
                  {recentUploads.map((d) => (
                    <li key={d.id}>
                      <button type="button" onClick={() => setPreviewDoc(d)} className="text-sm text-slate hover:text-accent hover:underline">
                        {d.file_name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {tab === "Files" && (
          <div>
            <div className="mb-4">
              <UploadZone
                workspaceId={workspaceId}
                entityType={entityType}
                entityId={entityId}
                folderId={selectedFolderId}
                visibility={audience === "portal" ? "client_visible" : "internal"}
              />
            </div>
            <div className="flex flex-col gap-4 sm:flex-row">
              <FolderTree
                folders={folders}
                selectedId={selectedFolderId}
                onSelect={setSelectedFolderId}
                counts={folderCounts}
                totalCount={activeDocuments.length}
              />
              <div className="flex-1">
                <DocumentList
                  documents={documentsInScope}
                  folders={folders}
                  onPreview={setPreviewDoc}
                  workspaceId={workspaceId}
                  entityType={entityType}
                  entityId={entityId}
                />
              </div>
            </div>
          </div>
        )}

        {tab === "Requests" && (
          <RequestsPanel
            requests={requests}
            templates={requestTemplates}
            workspaceId={workspaceId}
            entityType={entityType}
            entityId={entityId}
            audience={audience}
          />
        )}

        {tab === "Signatures" && (
          <SignaturesPanel signatureRequests={signatureRequests} documents={activeDocuments} workspaceId={workspaceId} audience={audience} />
        )}

        {tab === "Activity" && (
          <div className="rounded-xl border border-border bg-surface">
            {activity.length === 0 ? (
              <EmptyState message="No document activity yet." />
            ) : (
              <ul className="divide-y divide-border">
                {activity.map((a) => (
                  <li key={a.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                    <span className="text-slate">{a.description}</span>
                    <span className="text-xs text-muted">{new Date(a.created_at).toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {previewDoc && <PreviewPanel document={previewDoc} onClose={() => setPreviewDoc(null)} />}
    </div>
  );
}
