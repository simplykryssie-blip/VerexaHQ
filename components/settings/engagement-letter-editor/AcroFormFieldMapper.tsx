"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { MergeFieldPicker } from "@/components/settings/MergeFieldPicker";
import { insertAtFieldCursor } from "@/lib/insertAtFieldCursor";
import type { AcroformFieldMapping, DetectedPdfField } from "@/lib/documents/renderPdfTemplate";

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

type PositionedField = DetectedPdfField & { page: number; rect: NonNullable<DetectedPdfField["rect"]> };

// Shows the actual uploaded PDF (any PDF -- not tied to any one form) with a
// text box overlaid directly on top of each fillable field's real on-page
// position, so staff can see what they're mapping instead of matching a raw
// XFA/AcroForm field name against a bare list with no visual context. Each
// box holds a *template* -- free text that can mix staff-typed content with
// one or more {{merge_field}} tokens (via the "Insert merge field" picker,
// which drops a token at the last-focused box's cursor) -- so one field can
// combine several details ("name and address" boxes), or hold something no
// merge field covers (a file number, boilerplate text, a preset value) with
// no token at all. Any field whose position pdf-lib couldn't resolve still
// shows up in a plain fallback list below, so nothing becomes unmappable.
export function AcroFormFieldMapper({
  pdfBytes,
  detectedFields,
  mappings,
  onChange,
  disabled,
}: {
  pdfBytes: Uint8Array;
  detectedFields: DetectedPdfField[];
  mappings: AcroformFieldMapping[];
  onChange: (mappings: AcroformFieldMapping[]) => void;
  disabled?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inputRefs = useRef<Map<string, HTMLInputElement>>(new Map());
  const [pdfDoc, setPdfDoc] = useState<import("pdfjs-dist").PDFDocumentProxy | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [rendered, setRendered] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focusedField, setFocusedField] = useState<string | null>(null);

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
    setRendered(false);
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
      if (!cancelled) setRendered(true);
    });
    return () => {
      cancelled = true;
    };
  }, [pdfDoc, pageIndex]);

  const templateByPdfField = new Map(mappings.map((m) => [m.pdfFieldName, m.template]));

  function setMapping(pdfFieldName: string, template: string) {
    const next = mappings.filter((m) => m.pdfFieldName !== pdfFieldName);
    if (template.trim()) next.push({ kind: "acroform", pdfFieldName, template });
    onChange(next);
  }

  function insertToken(token: string) {
    if (!focusedField) return;
    const el = inputRefs.current.get(focusedField) ?? null;
    const current = templateByPdfField.get(focusedField) ?? "";
    insertAtFieldCursor(el, current, token, (next) => setMapping(focusedField, next));
  }

  if (detectedFields.length === 0) {
    return <p className="text-xs text-muted">This PDF has no fillable form fields.</p>;
  }

  const positioned = detectedFields.filter((f): f is PositionedField => f.page !== null && f.rect !== null);
  const unpositioned = detectedFields.filter((f) => f.page === null || f.rect === null);
  const fieldsOnPage = positioned.filter((f) => f.page === pageIndex);
  const mappedCount = detectedFields.filter((f) => (templateByPdfField.get(f.name) ?? "").trim()).length;

  function renderInput(field: DetectedPdfField, extraClassName: string, style?: CSSProperties) {
    const value = templateByPdfField.get(field.name) ?? "";
    const mapped = Boolean(value.trim());
    return (
      <input
        key={field.name}
        ref={(el) => {
          if (el) inputRefs.current.set(field.name, el);
          else inputRefs.current.delete(field.name);
        }}
        type="text"
        disabled={disabled}
        value={value}
        onChange={(e) => setMapping(field.name, e.target.value)}
        onFocus={() => setFocusedField(field.name)}
        title={field.name}
        placeholder="Type text or insert a merge field..."
        style={style}
        className={`rounded-md border px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-accent disabled:cursor-not-allowed disabled:opacity-60 ${
          mapped ? "border-accent bg-accentSoft font-medium text-accent" : "border-dashed border-slate/50 bg-white/90 text-muted"
        } ${extraClassName}`}
      />
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-surface shadow-soft p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Map PDF fields to merge fields</p>
          <p className="mt-1 text-xs text-muted">
            {detectedFields.length} fillable field{detectedFields.length === 1 ? "" : "s"} found -- {mappedCount} mapped. Click into a box, then
            type your own text, insert a merge field, or mix both -- e.g. combine a name and address on one line, or add boilerplate a merge
            field doesn&apos;t cover.
          </p>
        </div>
        {!disabled && <MergeFieldPicker label="Insert merge field" onInsert={insertToken} disabled={!focusedField} />}
      </div>

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      {!error && !pdfDoc && <p className="mt-3 text-xs text-muted">Loading preview...</p>}

      {!error && pdfDoc && (
        <>
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

          <div className="relative mt-3 inline-block rounded-lg border border-border">
            <canvas ref={canvasRef} className="block max-w-full" />
            {rendered &&
              fieldsOnPage.map((field) =>
                renderInput(field, "absolute", {
                  left: `${field.rect.xPct * 100}%`,
                  top: `${field.rect.yPct * 100}%`,
                  width: `${Math.max(field.rect.widthPct * 100, 10)}%`,
                  height: `${Math.max(field.rect.heightPct * 100, 3)}%`,
                })
              )}
          </div>
          {!rendered && <p className="mt-2 text-xs text-muted">Rendering page...</p>}
          {rendered && fieldsOnPage.length === 0 && (
            <p className="mt-2 text-xs text-muted">No fields resolved to this page.</p>
          )}
        </>
      )}

      {unpositioned.length > 0 && (
        <div className="mt-4 border-t border-border pt-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted">Other fields (position not found on the page)</p>
          <div className="mt-2 space-y-2">
            {unpositioned.map((field) => (
              <div key={field.name} className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-ink">{field.name}</p>
                  <p className="text-[11px] text-muted">{field.type.replace(/^PDF/, "")}</p>
                </div>
                {renderInput(field, "w-56 shrink-0 py-1.5")}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
