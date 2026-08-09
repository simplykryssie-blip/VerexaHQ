"use client";

import { RichTextEditor } from "./RichTextEditor";
import { interpolateSample } from "@/lib/engagementLetters/mergeFields";

/** Sandbox preview only -- interpolates {{tokens}} with realistic placeholder
 * values, not real client/engagement data (no send pipeline exists yet, same
 * scope boundary as the organizer builder's preview). Reuses RichTextEditor in
 * read-only mode rather than dangerouslySetInnerHTML, so no separate HTML
 * sanitizer is needed. */
export function EngagementLetterPreview({ bodyHtml, requiresSignature }: { bodyHtml: string; requiresSignature: boolean }) {
  const interpolated = interpolateSample(bodyHtml);

  return (
    <div className="mx-auto max-w-2xl rounded-xl border border-border bg-surface p-6 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-accent">Client preview</p>
      <p className="mt-1 text-xs text-muted">Sandbox only -- merge fields below are realistic placeholder values, not real client data.</p>
      <div className="mt-4">
        <RichTextEditor content={interpolated} editable={false} />
      </div>
      {requiresSignature && (
        <div className="mt-4 rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted">Signature capture area</div>
      )}
    </div>
  );
}
