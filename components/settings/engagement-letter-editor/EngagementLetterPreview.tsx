"use client";

import { RichTextEditor } from "@/components/settings/RichTextEditor";
import { interpolateSample } from "@/lib/mergeFields";

/** Sandbox preview only -- interpolates {{tokens}} with realistic placeholder
 * values, not real client/engagement data (no send pipeline exists yet, same
 * scope boundary as the organizer builder's preview). Reuses RichTextEditor in
 * read-only mode rather than dangerouslySetInnerHTML, so no separate HTML
 * sanitizer is needed. */
export function EngagementLetterPreview({ bodyHtml, requiresSignature }: { bodyHtml: string; requiresSignature: boolean }) {
  const interpolated = interpolateSample(bodyHtml);

  return (
    <div className="mx-auto max-w-[720px]">
      <p className="text-xs font-semibold uppercase tracking-wide text-accent">Client preview</p>
      <p className="mt-1 text-xs text-muted">Sandbox only -- merge fields below are realistic placeholder values, not real client data.</p>
      <div className="mt-4">
        <RichTextEditor content={interpolated} editable={false} documentStyle />
      </div>
      {requiresSignature && (
        <div className="mt-4 rounded-lg border border-dashed border-border bg-surface p-4 text-center text-xs text-muted">
          Signature capture area
        </div>
      )}
    </div>
  );
}
