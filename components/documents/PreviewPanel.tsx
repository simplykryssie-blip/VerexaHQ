"use client";

import { useEffect, useState } from "react";
import { X, Download } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { DocumentRow } from "./types";

function isPreviewable(mimeType: string | null) {
  if (!mimeType) return false;
  return mimeType === "application/pdf" || mimeType.startsWith("image/") || mimeType.startsWith("text/");
}

export function PreviewPanel({ document: doc, onClose }: { document: DocumentRow; onClose: () => void }) {
  const supabase = createClient();
  const [url, setUrl] = useState<string | null>(null);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setUrl(null);
    setTextContent(null);
    setError(null);

    supabase.storage
      .from("client-documents")
      .createSignedUrl(doc.storage_path, 300)
      .then(async ({ data, error: signError }) => {
        if (cancelled) return;
        if (signError || !data) {
          setError(signError?.message ?? "Could not load a preview link.");
          return;
        }
        setUrl(data.signedUrl);
        if (doc.mime_type?.startsWith("text/") && doc.mime_type !== "text/html") {
          try {
            const res = await fetch(data.signedUrl);
            setTextContent(await res.text());
          } catch {
            // Fall through -- the iframe/link fallback below still works.
          }
        }
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.id, doc.storage_path]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Preview of ${doc.file_name}`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6"
    >
      <div className="flex h-full w-full max-w-3xl flex-col rounded-2xl bg-surface shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="truncate text-sm font-semibold text-ink">{doc.file_name}</h2>
          <div className="flex items-center gap-2">
            {url && (
              <a
                href={url}
                download={doc.file_name}
                aria-label="Download document"
                className="rounded-lg p-1.5 text-muted hover:bg-surfaceMuted hover:text-ink"
              >
                <Download size={16} />
              </a>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close preview"
              className="rounded-lg p-1.5 text-muted hover:bg-surfaceMuted hover:text-ink"
            >
              <X size={16} />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-auto bg-surfaceMuted p-4">
          {error && <p className="text-sm text-danger">{error}</p>}
          {!error && !url && <p className="text-sm text-muted">Loading preview...</p>}
          {url && (doc.mime_type === "application/pdf" || doc.mime_type === "text/html") && (
            <iframe src={url} title={doc.file_name} className="h-full min-h-[60vh] w-full rounded-lg border border-border bg-white" />
          )}
          {url && doc.mime_type?.startsWith("image/") && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt={doc.file_name} className="mx-auto max-h-full rounded-lg" />
          )}
          {url && doc.mime_type?.startsWith("text/") && doc.mime_type !== "text/html" && (
            <pre className="whitespace-pre-wrap rounded-lg border border-border bg-surface p-4 text-sm text-slate">
              {textContent ?? "Loading text..."}
            </pre>
          )}
          {url && !isPreviewable(doc.mime_type) && doc.mime_type !== "text/html" && (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
              <p className="text-sm text-muted">
                Inline preview isn&apos;t available for this file type ({doc.mime_type ?? "unknown"}).
              </p>
              <a href={url} download={doc.file_name} className="text-sm font-medium text-accent hover:underline">
                Download to view
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
