"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { RichTextEditor } from "@/components/settings/RichTextEditor";
import { splitPagesByBreak } from "@/lib/documents/pageBreakSplit";

/** Renders an engagement letter one page at a time, each page framed to
 * standard Letter proportions (matches the PDF that eventually gets filed),
 * with Next/Previous navigation instead of one long scrolling document with
 * a divider line where a page break was inserted. `footer` renders only
 * once the reader reaches the last page -- the signature capture UI, so a
 * client can't sign without having paged through the whole letter. */
export function PaginatedDocument({ html, footer }: { html: string; footer?: React.ReactNode }) {
  const pages = splitPagesByBreak(html);
  const [index, setIndex] = useState(0);
  const isLast = index === pages.length - 1;

  return (
    <div>
      <div className="mx-auto w-full max-w-[816px] overflow-hidden rounded-sm bg-white shadow-lg ring-1 ring-border/60">
        <div className="min-h-[1056px]">
          {/* allowPageBreak registers the table/checklist extensions too (needed to
              correctly parse that markup within a page), even though a single
              already-split page never itself contains a page-break marker. */}
          <RichTextEditor content={pages[index]} editable={false} documentStyle allowPageBreak bare />
        </div>
      </div>

      {pages.length > 1 && (
        <div className="mt-3 flex items-center justify-center gap-4">
          <button
            type="button"
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
            disabled={index === 0}
            className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-slate hover:border-accent hover:text-accent disabled:opacity-40"
          >
            <ChevronLeft size={14} /> Previous
          </button>
          <span className="text-xs font-medium text-muted">
            Page {index + 1} of {pages.length}
          </span>
          <button
            type="button"
            onClick={() => setIndex((i) => Math.min(pages.length - 1, i + 1))}
            disabled={isLast}
            className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-slate hover:border-accent hover:text-accent disabled:opacity-40"
          >
            Next <ChevronRight size={14} />
          </button>
        </div>
      )}

      {isLast && footer}
    </div>
  );
}
