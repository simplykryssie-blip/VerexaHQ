"use client";

import { useEffect, useRef, useState } from "react";
import { Upload, Download } from "lucide-react";
import { supabasePortal } from "@/lib/supabasePortal";
import { usePortal } from "@/components/portal/PortalContext";
import type { Document, DocumentFolder } from "@/lib/types";
import StatusPill from "@/components/StatusPill";
import { friendlyError } from "@/lib/friendlyError";

const NEEDS_UPLOAD_STATUSES = ["Needed", "Requested", "Rejected"];

export default function PortalDocumentsPage() {
  const { access } = usePortal();
  const [docs, setDocs] = useState<Document[]>([]);
  const [folders, setFolders] = useState<DocumentFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  async function load() {
    if (!access) return;
    setLoading(true);
    const [docsRes, foldersRes] = await Promise.all([
      supabasePortal
        .from("documents")
        .select("*")
        .eq("client_id", access.client_id)
        .order("created_at", { ascending: false }),
      supabasePortal
        .from("document_folders")
        .select("*")
        .eq("client_id", access.client_id)
        .eq("is_visible_to_client", true)
        .order("sort_order"),
    ]);
    if (docsRes.error) {
      setError(docsRes.error.message);
    } else {
      setDocs((docsRes.data as Document[]) ?? []);
      setFolders((foldersRes.data as DocumentFolder[]) ?? []);
      setError(null);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [access]);

  async function handleUpload(doc: Document, file: File) {
    if (!access) return;
    setUploadingId(doc.id);
    setError(null);

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${access.workspace_id}/${access.client_id}/${Date.now()}-${safeName}`;

    const { error: uploadError } = await supabasePortal.storage
      .from("verexahq-client-documents")
      .upload(path, file);

    if (uploadError) {
      setError(friendlyError(uploadError, "Something went wrong uploading that file. Please try again."));
      setUploadingId(null);
      return;
    }

    const { error: submitError } = await supabasePortal.rpc("submit_client_document", {
      p_document_id: doc.id,
      p_storage_path: path,
      p_original_file_name: file.name,
      p_mime_type: file.type || null,
      p_file_size_bytes: file.size,
    });

    setUploadingId(null);
    if (submitError) {
      setError(friendlyError(submitError, "Something went wrong uploading that file. Please try again."));
      return;
    }
    load();
  }

  async function handleDownload(doc: Document) {
    if (!doc.storage_path) return;
    const { data, error } = await supabasePortal.storage
      .from("verexahq-client-documents")
      .createSignedUrl(doc.storage_path, 60);
    if (!error && data) window.open(data.signedUrl, "_blank");
  }

  if (!access) return null;

  return (
    <div>
      <div className="border-b border-line pb-3 mb-4">
        <h1 className="font-slab text-2xl font-bold text-ink">Documents</h1>
      </div>

      {error && (
        <div className="text-sm text-brick bg-brick/10 border border-brick/30 rounded-sm px-4 py-3 mb-4">
          {error}
        </div>
      )}

      {!loading && docs.length === 0 && (
        <div className="bg-white border border-line rounded-sm px-5 py-6 text-sm text-muted">
          No documents yet.
        </div>
      )}
      {loading && (
        <div className="bg-white border border-line rounded-sm px-5 py-6 text-sm text-muted">
          Loading…
        </div>
      )}

      {[...folders, null].map((folder) => {
        const folderDocs = docs.filter((d) => (folder ? d.folder_id === folder.id : !d.folder_id));
        if (folderDocs.length === 0) return null;
        return (
          <div key={folder ? folder.id : "unfiled"} className="mb-4">
            {folders.length > 0 && (
              <div className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">
                {folder ? folder.folder_name : "Unfiled"}
              </div>
            )}
            <div className="bg-white border border-line rounded-sm divide-y divide-paperDim">
              {folderDocs.map((d) => {
                const needsUpload = NEEDS_UPLOAD_STATUSES.includes(d.document_status);
                return (
                  <div key={d.id} className="flex items-center justify-between px-5 py-3.5">
                    <div>
                      <div className="font-semibold text-ink text-sm">{d.document_name}</div>
                      {d.document_category && (
                        <div className="text-xs text-muted mt-0.5">{d.document_category}</div>
                      )}
                      {d.document_status === "Rejected" && d.rejection_reason && (
                        <div className="text-xs text-brick mt-1">
                          Rejected: {d.rejection_reason}
                        </div>
                      )}
                      {d.client_message && d.document_status !== "Rejected" && (
                        <div className="text-xs text-muted mt-1">{d.client_message}</div>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <StatusPill status={d.document_status} />
                      {needsUpload && (
                        <>
                          <input
                            ref={(el) => {
                              fileInputRefs.current[d.id] = el;
                            }}
                            type="file"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) handleUpload(d, file);
                            }}
                          />
                          <button
                            onClick={() => fileInputRefs.current[d.id]?.click()}
                            disabled={uploadingId === d.id}
                            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-sm bg-ink text-white disabled:opacity-60"
                          >
                            <Upload size={13} />
                            {uploadingId === d.id ? "Uploading…" : "Upload"}
                          </button>
                        </>
                      )}
                      {!needsUpload && d.storage_path && (
                        <button
                          onClick={() => handleDownload(d)}
                          className="text-muted hover:text-ink"
                        >
                          <Download size={15} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
