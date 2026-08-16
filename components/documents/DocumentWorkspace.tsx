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
  EngagementLetterTemplateOption,
  EntityType,
  SignatureRequestRow,
} from "./types";

export function DocumentWorkspace({
  workspaceId,
  entityType,
  entityId,
  folders,
  documents,
  requests,
  requestTemplates,
  signatureRequests,
  signatureTemplates = [],
  clientName,
  clientEmail,
  firmName,
  activity,
  audience = "staff",
  canRequestDocuments = true,
  canRequestSignatures = true,
}: {
  workspaceId: string;
  entityType: EntityType;
  entityId: string;
  folders: DocumentFolderRow[];
  documents: DocumentRow[];
  requests: DocumentRequestRow[];
  requestTemplates: DocumentRequestTemplateOption[];
  signatureRequests: SignatureRequestRow[];
  signatureTemplates?: EngagementLetterTemplateOption[];
  clientName?: string;
  clientEmail?: string | null;
  firmName?: string;
  activity: ActivityRow[];
  audience?: Audience;
  canRequestDocuments?: boolean;
  canRequestSignatures?: boolean;
}) {
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [showActivity, setShowActivity] = useState(false);
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

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold text-ink">Files</h3>
        <div className="mb-4">
          <UploadZone
            workspaceId={workspaceId}
            entityType={entityType}
            entityId={entityId}
            folderId={selectedFolderId}
            audience={audience}
            clientEmail={clientEmail}
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

      <div>
        <h3 className="mb-3 text-sm font-semibold text-ink">
          Requests{pendingRequests.length > 0 && <span className="ml-1.5 rounded-full bg-accentSoft px-1.5 py-0.5 text-[10px] font-medium text-accent">{pendingRequests.length}</span>}
        </h3>
        <RequestsPanel
          requests={requests}
          templates={requestTemplates}
          workspaceId={workspaceId}
          entityType={entityType}
          entityId={entityId}
          audience={audience}
          canCreate={canRequestDocuments}
          clientEmail={clientEmail}
        />
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold text-ink">
          Signatures{pendingSignatures.length > 0 && <span className="ml-1.5 rounded-full bg-accentSoft px-1.5 py-0.5 text-[10px] font-medium text-accent">{pendingSignatures.length}</span>}
        </h3>
        <SignaturesPanel
          signatureRequests={signatureRequests}
          documents={activeDocuments}
          templates={signatureTemplates}
          entityType={entityType}
          entityId={entityId}
          clientName={clientName}
          clientEmail={clientEmail}
          firmName={firmName}
          workspaceId={workspaceId}
          audience={audience}
          canCreate={canRequestSignatures}
        />
      </div>

      <div>
        <button
          type="button"
          onClick={() => setShowActivity((v) => !v)}
          className="text-sm font-medium text-accent hover:underline"
        >
          {showActivity ? "Hide activity" : "Show activity"}
        </button>
        {showActivity && (
          <div className="mt-3 rounded-xl border border-border bg-surface">
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
