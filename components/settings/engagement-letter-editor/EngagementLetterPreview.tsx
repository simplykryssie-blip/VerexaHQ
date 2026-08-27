"use client";

import { useState } from "react";
import { PaginatedDocument } from "@/components/documents/PaginatedDocument";
import { SignaturePad, type SignatureMode } from "@/components/SignaturePad";
import { useToast } from "@/components/Toast";
import { interpolateSample } from "@/lib/mergeFields";

/** Sandbox preview only -- interpolates {{tokens}} with realistic placeholder
 * values, not real client/engagement data (no send pipeline exists yet, same
 * scope boundary as the organizer builder's preview). Reuses RichTextEditor in
 * read-only mode rather than dangerouslySetInnerHTML, so no separate HTML
 * sanitizer is needed. The signature box below is the actual SignaturePad a
 * client signs with on the real link -- fully interactive so staff can check
 * it looks right, but "Confirm signature" doesn't submit anything here. */
export function EngagementLetterPreview({
  bodyHtml,
  requiresSignature,
  bannerImageUrl,
}: {
  bodyHtml: string;
  requiresSignature: boolean;
  bannerImageUrl?: string | null;
}) {
  const toast = useToast();
  const interpolated = interpolateSample(bodyHtml);
  const [mode, setMode] = useState<SignatureMode>("typed");
  const [typedName, setTypedName] = useState("Jordan Client");
  const [drawnDataUrl, setDrawnDataUrl] = useState<string | null>(null);

  return (
    <div>
      <p className="mx-auto max-w-[816px] text-xs font-semibold uppercase tracking-wide text-accent">Client preview</p>
      <p className="mx-auto mt-1 max-w-[816px] text-xs text-muted">
        Sandbox only -- merge fields are realistic placeholder values, not real client data, and the signature box below doesn&apos;t submit
        anything.
      </p>
      <div className="mt-4">
        <PaginatedDocument
          html={interpolated}
          bannerImageUrl={bannerImageUrl}
          footer={
            requiresSignature ? (
              <div className="mt-4 rounded-2xl border border-border bg-surface shadow-soft p-4">
                <SignaturePad
                  mode={mode}
                  onModeChange={setMode}
                  typedName={typedName}
                  onTypedNameChange={setTypedName}
                  onDrawnChange={setDrawnDataUrl}
                  typedLabel="Type your full name to sign this letter electronically"
                />
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={() => toast.show("This is a preview -- nothing is submitted here.", "info")}
                    disabled={mode === "typed" ? !typedName.trim() : !drawnDataUrl}
                    className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-60"
                  >
                    Confirm signature
                  </button>
                </div>
              </div>
            ) : undefined
          }
        />
      </div>
    </div>
  );
}
