"use client";

import { useEffect, useRef, useState } from "react";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { MERGE_FIELD_GROUPS, ALL_MERGE_FIELDS } from "@/lib/mergeFields";
import type { OverlayFieldMapping } from "@/lib/documents/renderPdfTemplate";

const DEFAULT_FONT_SIZE = 11;

let pdfjsInitPromise: Promise<typeof import("pdfjs-dist")> | null = null;
function loadPdfjs() {
  if (!pdfjsInitPromise) {
    pdfjsInitPromise = import("pdfjs-dist").then((pdfjsLib) => {
      pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.js";
      return pdfjsLib;
    });
  }
  return pdfjsInitPromise;
}

// A flat/scanned PDF has no fillable fields to map, so staff instead click
// directly on a rendered preview of each page to drop a merge field where it
// should print -- this is what actually places text at render time
// (lib/documents/renderPdfTemplate.ts's "overlay" mode). Coordinates are
// stored as page-relative percentages (0-1, measured from the top-left, same
// as the click), so they stay correct regardless of render resolution.
export function OverlayFieldPlacer({
  pdfBytes,
  mappings,
  onChange,
  disabled,
}: {
  pdfBytes: Uint8Array;
  mappings: OverlayFieldMapping[];
  onChange: (mappings: OverlayFieldMapping[]) => void;
  disabled?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pdfDoc, setPdfDoc] = useState<import("pdfjs-dist").PDFDocumentProxy | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [pendingField, setPendingField] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadPdfjs()
      .then((pdfjsLib) => pdfjsLib.getDocument({ data: pdfBytes.slice() }).promise)
      .then((doc) => {
        if (!cancelled) setPdfDoc(doc);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load this PDF for preview.");
      });
    return () => {
      cancelled = true;
    };
    // pdfBytes is a stable snapshot passed down once per upload -- re-running
    // this on every render would reload the same document repeatedly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return;
    let cancelled = false;
    pdfDoc.getPage(pageIndex + 1).then(async (page) => {
      if (cancelled) return;
      const viewport = page.getViewport({ scale: 1.3 });
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      await page.render({ canvasContext: ctx, viewport }).promise;
      if (!cancelled) setCanvasSize({ width: viewport.width, height: viewport.height });
    });
    return () => {
      cancelled = true;
    };
  }, [pdfDoc, pageIndex]);

  function placeField(e: React.MouseEvent<HTMLDivElement>) {
    if (!pendingField || disabled) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const xPct = (e.clientX - rect.left) / rect.width;
    const yPct = (e.clientY - rect.top) / rect.height;
    onChange([...mappings, { kind: "overlay", mergeField: pendingField, page: pageIndex, xPct, yPct, fontSize: DEFAULT_FONT_SIZE }]);
    setPendingField(null);
  }

  function removeMapping(index: number) {
    onChange(mappings.filter((_, i) => i !== index));
  }

  const labelByToken = new Map(ALL_MERGE_FIELDS.map((f) => [f.token, f.label]));
  const mappingsOnPage = mappings.map((m, i) => ({ ...m, index: i })).filter((m) => m.page === pageIndex);

  if (error) return <p className="text-sm text-danger">{error}</p>;
  if (!pdfDoc) return <p className="text-xs text-muted">Loading preview...</p>;

  return (
    <div className="rounded-2xl border border-border bg-surface shadow-soft p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">Click to place merge fields</p>
      <p className="mt-1 text-xs text-muted">
        This PDF has no fillable fields, so pick a detail below, then click on the page where it should print.
      </p>

      {!disabled && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {MERGE_FIELD_GROUPS.flatMap((g) => g.fields).map((f) => (
            <button
              key={f.token}
              type="button"
              onClick={() => setPendingField((v) => (v === f.token ? null : f.token))}
              className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                pendingField === f.token ? "border-accent bg-accent text-white" : "border-border text-slate hover:border-accent hover:text-accent"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}
      {pendingField && <p className="mt-1.5 text-[11px] text-accent">Click on the page below to place &quot;{labelByToken.get(pendingField)}&quot;.</p>}

      {pdfDoc.numPages > 1 && (
        <div className="mt-3 flex items-center gap-2 text-xs text-muted">
          <button
            type="button"
            disabled={pageIndex === 0}
            onClick={() => setPageIndex((p) => p - 1)}
            className="rounded-lg border border-border p-1 hover:bg-surfaceMuted disabled:opacity-40"
          >
            <ChevronLeft size={14} />
          </button>
          Page {pageIndex + 1} of {pdfDoc.numPages}
          <button
            type="button"
            disabled={pageIndex === pdfDoc.numPages - 1}
            onClick={() => setPageIndex((p) => p + 1)}
            className="rounded-lg border border-border p-1 hover:bg-surfaceMuted disabled:opacity-40"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      )}

      <div
        className="relative mt-3 inline-block overflow-hidden rounded-lg border border-border"
        style={{ cursor: pendingField ? "crosshair" : "default" }}
        onClick={placeField}
      >
        <canvas ref={canvasRef} className="block max-w-full" />
        {mappingsOnPage.map((m) => (
          <div
            key={m.index}
            className="absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 rounded-full border border-accent bg-accentSoft px-2 py-0.5 text-[10px] font-medium text-accent shadow-sm"
            style={{ left: `${m.xPct * 100}%`, top: `${m.yPct * 100}%` }}
            onClick={(e) => e.stopPropagation()}
          >
            {labelByToken.get(m.mergeField) ?? m.mergeField}
            {!disabled && (
              <button type="button" onClick={() => removeMapping(m.index)} aria-label="Remove" className="hover:text-danger">
                <X size={10} />
              </button>
            )}
          </div>
        ))}
      </div>
      {canvasSize.width === 0 && <p className="mt-2 text-xs text-muted">Rendering page...</p>}
    </div>
  );
}
