"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { SignaturePad } from "@/components/SignaturePad";

type SignRequestData = {
  signer_id: string;
  signer_name: string;
  signer_status: "pending" | "signed" | "declined";
  signed_at: string | null;
  declined_at: string | null;
  decline_reason: string | null;
  request_title: string;
  request_status: string;
  attachment_id: string;
  attachment_file_name: string;
  attachment_mime_type: string | null;
  workspace_id: string;
  workspace_name: string;
};

function isPreviewable(mimeType: string | null) {
  if (!mimeType) return false;
  return mimeType === "application/pdf" || mimeType.startsWith("image/");
}

export function PublicSignView({ token, initialData }: { token: string; initialData: SignRequestData }) {
  const supabase = createClient();
  const [data, setData] = useState(initialData);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [typedName, setTypedName] = useState(initialData.signer_name);
  const [drawnDataUrl, setDrawnDataUrl] = useState<string | null>(null);
  const [declineReason, setDeclineReason] = useState("");
  const [showDecline, setShowDecline] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/sign/${token}/file`)
      .then((r) => r.json())
      .then((json) => {
        if (json.error) setFileError(json.error);
        else setFileUrl(json.url);
      })
      .catch(() => setFileError("Could not load the document."));
  }, [token]);

  async function sign() {
    if (!typedName.trim() || !drawnDataUrl) return;
    setSubmitting(true);
    setError(null);

    const res = await fetch(`/api/sign/${token}/signature-image`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dataUrl: drawnDataUrl }),
    });
    const result = await res.json().catch(() => ({}));
    if (!res.ok) {
      setSubmitting(false);
      setError(result.error ?? "Could not save your signature.");
      return;
    }

    const { error: rpcError } = await supabase.rpc("record_signature_by_token", {
      p_token: token,
      p_signature_type: "drawn",
      p_typed_name: typedName.trim(),
      p_signature_image_path: result.path,
    });
    setSubmitting(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    setData((d) => ({ ...d, signer_status: "signed", signed_at: new Date().toISOString() }));
  }

  async function decline() {
    setSubmitting(true);
    setError(null);
    const { error: rpcError } = await supabase.rpc("decline_signature_by_token", {
      p_token: token,
      p_reason: declineReason.trim() || undefined,
    });
    setSubmitting(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    setData((d) => ({ ...d, signer_status: "declined", declined_at: new Date().toISOString(), decline_reason: declineReason.trim() || null }));
  }

  if (data.signer_status !== "pending") {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-border bg-surface p-8 text-center">
        <h1 className="text-lg font-semibold text-ink">
          {data.signer_status === "signed" ? "Signed -- thank you" : "Signing request declined"}
        </h1>
        <p className="mt-2 text-sm text-muted">
          {data.request_title} ({data.attachment_file_name})
          {data.signer_status === "signed" && data.signed_at && ` -- signed ${new Date(data.signed_at).toLocaleString()}`}
          {data.signer_status === "declined" && data.declined_at && ` -- declined ${new Date(data.declined_at).toLocaleString()}`}
        </p>
        <p className="mt-4 text-xs text-muted">You may close this page.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-4 sm:p-8">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted">{data.workspace_name}</p>
        <h1 className="text-lg font-semibold text-ink">{data.request_title}</h1>
        <p className="text-sm text-muted">Requesting signature from {data.signer_name}</p>
      </div>

      <div className="min-h-[50vh] flex-1 rounded-xl border border-border bg-surfaceMuted p-3">
        {fileError && <p className="text-sm text-danger">{fileError}</p>}
        {!fileError && !fileUrl && <p className="text-sm text-muted">Loading document...</p>}
        {fileUrl && isPreviewable(data.attachment_mime_type) && data.attachment_mime_type === "application/pdf" && (
          <iframe src={fileUrl} title={data.attachment_file_name} className="h-full min-h-[50vh] w-full rounded-lg border border-border bg-white" />
        )}
        {fileUrl && data.attachment_mime_type?.startsWith("image/") && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={fileUrl} alt={data.attachment_file_name} className="mx-auto max-h-[70vh] rounded-lg" />
        )}
        {fileUrl && !isPreviewable(data.attachment_mime_type) && (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <p className="text-sm text-muted">Inline preview isn&apos;t available for this file type.</p>
            <a href={fileUrl} download={data.attachment_file_name} className="text-sm font-medium text-accent hover:underline">
              Download to view
            </a>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-border bg-surface shadow-soft p-4">
        {!showDecline ? (
          <>
            <SignaturePad
              typedName={typedName}
              onTypedNameChange={setTypedName}
              onDrawnChange={setDrawnDataUrl}
              typedLabel="Type your full name to sign this document electronically"
            />
            {error && <p className="mt-2 text-sm text-danger">{error}</p>}
            <div className="mt-3 flex items-center gap-3">
              <button
                type="button"
                onClick={sign}
                disabled={submitting || !typedName.trim() || !drawnDataUrl}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-60"
              >
                {submitting ? "Signing..." : "Confirm signature"}
              </button>
              <button type="button" onClick={() => setShowDecline(true)} className="text-sm text-danger hover:underline">
                Decline to sign
              </button>
            </div>
          </>
        ) : (
          <>
            <label htmlFor="decline-reason" className="block text-sm font-medium text-ink">
              Reason for declining (optional)
            </label>
            <textarea
              id="decline-reason"
              value={declineReason}
              onChange={(e) => setDeclineReason(e.target.value)}
              rows={3}
              className="mt-2 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
            {error && <p className="mt-2 text-sm text-danger">{error}</p>}
            <div className="mt-3 flex items-center gap-3">
              <button
                type="button"
                onClick={decline}
                disabled={submitting}
                className="rounded-lg bg-danger px-4 py-2 text-sm font-medium text-white hover:bg-danger/90 disabled:opacity-60"
              >
                {submitting ? "Submitting..." : "Confirm decline"}
              </button>
              <button type="button" onClick={() => setShowDecline(false)} className="text-sm text-muted hover:text-ink">
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
