"use client";

import { useState } from "react";
import { Camera, Upload, FileText, X } from "lucide-react";
import { supabaseIntake, type IntakeDocumentRequest } from "@/lib/supabaseIntake";

export type UploadedDoc = { id: string; document_request_id: string; original_file_name: string; mime_type: string; uploaded_at: string };

const STATUS_LABEL: Record<string, string> = {
  requested: "Needed",
  uploaded: "Uploaded",
  under_review: "Under review",
  accepted: "Accepted",
  replacement_needed: "Needs replacement",
  waiting_on_client: "Waiting on this",
  not_applicable: "Not applicable",
  waived_by_staff: "Waived",
};

function isImage(mime: string) {
  return mime.startsWith("image/");
}

export function Section7Documents({
  token,
  docs,
  uploaded,
  onRefresh,
}: {
  token: string;
  docs: IntakeDocumentRequest[];
  uploaded: UploadedDoc[];
  onRefresh: () => void;
}) {
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [noteDraftKey, setNoteDraftKey] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");

  const blockingMissing = docs.filter((d) => d.is_blocking && d.status === "requested").length;

  async function handleFiles(doc: IntakeDocumentRequest, files: FileList) {
    setUploadingKey(doc.id);
    setError(null);
    for (const file of Array.from(files)) {
      if (isImage(file.type)) {
        const url = URL.createObjectURL(file);
        setPreviewUrls((prev) => ({ ...prev, [`${doc.id}:${file.name}`]: url }));
      }
      const fd = new FormData();
      fd.append("token", token);
      fd.append("documentRequestId", doc.id);
      fd.append("file", file);
      const res = await fetch("/api/intake/upload", { method: "POST", body: fd });
      const json = await res.json().catch(() => ({ ok: false }));
      if (!json.ok) {
        setError(json.error || "Upload failed. Please try again.");
      }
    }
    setUploadingKey(null);
    onRefresh();
  }

  async function setStatus(doc: IntakeDocumentRequest, status: "requested" | "waiting_on_client" | "not_applicable", note?: string) {
    const { error: rpcError } = await supabaseIntake.rpc("public_update_document_request", {
      p_token: token,
      p_document_request_id: doc.id,
      p_status: status,
      p_client_note: note ?? null,
    });
    if (rpcError) {
      setError("Couldn't update that item. Please try again.");
      return;
    }
    setNoteDraftKey(null);
    setNoteDraft("");
    onRefresh();
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Based on your answers, here&apos;s what we&apos;ll need. You can still submit if something is
        missing -- we&apos;ll follow up.
      </p>
      {blockingMissing > 0 && (
        <p className="text-xs text-amber bg-amber/10 border border-amber/30 rounded-sm px-3 py-2">
          {blockingMissing} required document{blockingMissing === 1 ? "" : "s"} still needed.
        </p>
      )}
      {error && <p className="text-xs text-brick">{error}</p>}

      <div className="space-y-3">
        {docs.map((doc) => {
          const files = uploaded.filter((u) => u.document_request_id === doc.id);
          return (
            <div key={doc.id} className="border border-line rounded-sm p-3">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-ink break-words">
                    {doc.item_title}
                    {doc.is_required && <span className="text-brick ml-1">*</span>}
                  </div>
                  <div className="text-xs text-muted break-words">{doc.item_reason}</div>
                  <div className="text-xs mt-0.5 text-ink font-medium">{STATUS_LABEL[doc.status] || doc.status}</div>
                </div>
              </div>

              {files.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2">
                  {files.map((f) => {
                    const preview = previewUrls[`${doc.id}:${f.original_file_name}`];
                    return (
                      <div key={f.id} className="flex items-center gap-1.5 text-xs bg-paperDim border border-line rounded-sm px-2 py-1 max-w-full">
                        {preview ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={preview} alt="" className="w-6 h-6 object-cover rounded-sm shrink-0" />
                        ) : (
                          <FileText size={14} className="shrink-0" />
                        )}
                        <span className="truncate max-w-[10rem]">{f.original_file_name}</span>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <label className="flex items-center gap-1 text-xs font-semibold text-ink border border-line rounded-sm px-2.5 py-1.5 cursor-pointer">
                  <Upload size={14} />
                  {uploadingKey === doc.id ? "Uploading…" : files.length > 0 ? "Add / replace" : "Upload"}
                  <input
                    type="file"
                    multiple
                    className="hidden"
                    disabled={uploadingKey === doc.id}
                    onChange={(e) => {
                      if (e.target.files && e.target.files.length > 0) void handleFiles(doc, e.target.files);
                      e.target.value = "";
                    }}
                  />
                </label>
                <label className="flex items-center gap-1 text-xs font-semibold text-ink border border-line rounded-sm px-2.5 py-1.5 cursor-pointer">
                  <Camera size={14} />
                  Camera
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    disabled={uploadingKey === doc.id}
                    onChange={(e) => {
                      if (e.target.files && e.target.files.length > 0) void handleFiles(doc, e.target.files);
                      e.target.value = "";
                    }}
                  />
                </label>
                {doc.status !== "waiting_on_client" && (
                  <button type="button" onClick={() => setStatus(doc, "waiting_on_client")} className="text-xs font-semibold text-muted border border-line rounded-sm px-2.5 py-1.5">
                    Waiting on it
                  </button>
                )}
                {doc.status !== "not_applicable" && !doc.is_required && (
                  <button type="button" onClick={() => setStatus(doc, "not_applicable")} className="text-xs font-semibold text-muted border border-line rounded-sm px-2.5 py-1.5">
                    Not applicable
                  </button>
                )}
                {(doc.status === "waiting_on_client" || doc.status === "not_applicable") && (
                  <button type="button" onClick={() => setStatus(doc, "requested")} className="text-xs font-semibold text-muted border border-line rounded-sm px-2.5 py-1.5">
                    Undo
                  </button>
                )}
                {noteDraftKey === doc.id ? (
                  <div className="flex items-center gap-1 w-full mt-1">
                    <input
                      value={noteDraft}
                      onChange={(e) => setNoteDraft(e.target.value)}
                      placeholder="Add a short explanation…"
                      className="flex-1 min-w-0 border border-line rounded-sm px-2 py-1.5 text-xs"
                    />
                    <button type="button" onClick={() => setStatus(doc, "waiting_on_client", noteDraft)} className="text-xs font-semibold text-ink border border-line rounded-sm px-2 py-1.5">
                      Save
                    </button>
                    <button type="button" onClick={() => setNoteDraftKey(null)} aria-label="Cancel">
                      <X size={14} className="text-muted" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setNoteDraftKey(doc.id);
                      setNoteDraft(doc.client_note || "");
                    }}
                    className="text-xs font-semibold text-muted underline"
                  >
                    Add note
                  </button>
                )}
              </div>
              {doc.client_note && noteDraftKey !== doc.id && <p className="text-xs text-muted mt-1.5 break-words">&quot;{doc.client_note}&quot;</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
