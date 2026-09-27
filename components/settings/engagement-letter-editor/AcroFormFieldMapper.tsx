"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, CheckSquare, Square, AlertTriangle, ListTree } from "lucide-react";
import { MergeFieldPicker } from "@/components/settings/MergeFieldPicker";
import { insertAtFieldCursor } from "@/lib/insertAtFieldCursor";
import { MERGE_FIELD_GROUPS, type MergeFieldValueKind } from "@/lib/mergeFields";
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

const CHECKBOX_TYPES = new Set(["PDFCheckBox"]);
const CHOICE_TYPES = new Set(["PDFRadioGroup", "PDFDropdown", "PDFOptionList"]);

function fieldKindLabel(type: string): string {
  if (CHECKBOX_TYPES.has(type)) return "Checkbox";
  if (type === "PDFRadioGroup") return "Radio group";
  if (type === "PDFDropdown") return "Dropdown";
  if (type === "PDFOptionList") return "Option list";
  if (type === "PDFTextField") return "Text";
  return type.replace(/^PDF/, "");
}

// A soft, non-authoritative signal that a field is administrative/office-use
// rather than something a preparer should ever map client or designee data
// into -- checked against the field's own dotted/bracketed AcroForm path
// (LiveCycle-authored government forms commonly group such fields under a
// "...Header[0]..." subform) since there's no generic, reliable way to know
// a field's real-world meaning from pdf-lib data alone. Shown as a caution,
// never a hard block, since it can't be certain for an arbitrary PDF.
function looksAdministrative(fieldName: string): boolean {
  return /header/i.test(fieldName);
}

function humanLabel(field: DetectedPdfField): string {
  if (field.tooltip && field.tooltip.trim()) return field.tooltip.trim();
  // Fall back to the last bracketed segment of the raw AcroForm path --
  // still better than the full dotted name for a quick scan of the list.
  const parts = field.name.split(".");
  return parts[parts.length - 1]?.replace(/\[\d+\]$/, "") || field.name;
}

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
  const editorInputRef = useRef<HTMLInputElement | null>(null);
  const rowRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const [pdfDoc, setPdfDoc] = useState<import("pdfjs-dist").PDFDocumentProxy | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [rendered, setRendered] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeField, setActiveField] = useState<string | null>(null);

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
      const viewport = page.getViewport({ scale: 1.6 });
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

  function selectField(field: DetectedPdfField) {
    setActiveField(field.name);
    if (field.page !== null) setPageIndex(field.page);
    rowRefs.current.get(field.name)?.scrollIntoView({ block: "nearest" });
  }

  function insertToken(token: string) {
    if (!activeField) return;
    const current = templateByPdfField.get(activeField) ?? "";
    insertAtFieldCursor(editorInputRef.current, current, token, (next) => setMapping(activeField, next));
  }

  if (detectedFields.length === 0) {
    return <p className="text-xs text-muted">This PDF has no fillable form fields.</p>;
  }

  const positioned = detectedFields.filter((f): f is PositionedField => f.page !== null && f.rect !== null);
  const fieldsOnPage = positioned.filter((f) => f.page === pageIndex);
  const mappedCount = detectedFields.filter((f) => (templateByPdfField.get(f.name) ?? "").trim()).length;
  const activeFieldData = detectedFields.find((f) => f.name === activeField) ?? null;
  const activeIsCheckbox = activeFieldData ? CHECKBOX_TYPES.has(activeFieldData.type) : false;
  const activeIsChoice = activeFieldData ? CHOICE_TYPES.has(activeFieldData.type) : false;
  const activeValue = activeField ? templateByPdfField.get(activeField) ?? "" : "";
  const activeIsMapped = Boolean(activeValue.trim());

  // Text fields shouldn't be offered a checkbox-only boolean token (it would
  // just print the literal word "true"), but a checkbox can sensibly use any
  // resolved value as its truthy/falsy signal, so it keeps the full list.
  const pickerGroups = activeIsCheckbox
    ? MERGE_FIELD_GROUPS
    : MERGE_FIELD_GROUPS.map((g) => ({ ...g, fields: g.fields.filter((f) => (f.valueKind as MergeFieldValueKind | undefined) !== "boolean") }));

  function markerStyle(field: PositionedField) {
    return {
      left: `${field.rect.xPct * 100}%`,
      top: `${field.rect.yPct * 100}%`,
      width: `${field.rect.widthPct * 100}%`,
      height: `${field.rect.heightPct * 100}%`,
    };
  }

  return (
    <div className="rounded-2xl border border-border bg-surface shadow-soft p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Map PDF fields to merge fields</p>
          <p className="mt-1 text-xs text-muted">
            {detectedFields.length} fillable field{detectedFields.length === 1 ? "" : "s"} found -- {mappedCount} mapped. Select a field from the
            list or click its marker on the page, then map it below.
          </p>
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      {!error && !pdfDoc && <p className="mt-3 text-xs text-muted">Loading preview...</p>}

      {!error && pdfDoc && (
        <>
          {/* Selected-field editor -- fixed, roomy panel so editing never
              happens inside a field's own tiny/overlapping real rectangle. */}
          <div className="mt-3 rounded-xl border border-border bg-surfaceMuted p-3">
            {!activeFieldData ? (
              <p className="text-xs text-muted">No field selected. Click a marker on the page or a row in the field list.</p>
            ) : (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-ink">{humanLabel(activeFieldData)}</p>
                    <p className="font-mono text-[11px] text-muted">{activeFieldData.name}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="rounded-full border border-border bg-surface px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted">
                      {fieldKindLabel(activeFieldData.type)}
                    </span>
                    {looksAdministrative(activeFieldData.name) && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-[10px] font-medium text-warning">
                        <AlertTriangle size={11} /> Possibly office-use only -- review before mapping
                      </span>
                    )}
                  </div>
                </div>

                {activeIsCheckbox ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => setMapping(activeField!, "")}
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium ${
                        !activeIsMapped ? "border-accent bg-accentSoft text-accent" : "border-border text-slate hover:bg-surface"
                      }`}
                    >
                      <Square size={13} /> Not mapped
                    </button>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => setMapping(activeField!, "true")}
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium ${
                        activeValue === "true" ? "border-accent bg-accentSoft text-accent" : "border-border text-slate hover:bg-surface"
                      }`}
                    >
                      <CheckSquare size={13} /> Always checked
                    </button>
                    {!disabled && <MergeFieldPicker label="Check when..." groups={pickerGroups} onInsert={(t) => setMapping(activeField!, t)} />}
                    {activeIsMapped && activeValue !== "true" && (
                      <code className="rounded-md bg-surface px-2 py-1 text-[11px] text-ink">{activeValue}</code>
                    )}
                  </div>
                ) : activeIsChoice ? (
                  <div className="space-y-1.5">
                    <input
                      ref={editorInputRef}
                      type="text"
                      disabled={disabled}
                      value={activeValue}
                      onChange={(e) => setMapping(activeField!, e.target.value)}
                      placeholder="Exact option value, or insert a merge field..."
                      className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                    />
                    {activeFieldData.options && activeFieldData.options.length > 0 && (
                      <p className="text-[11px] text-muted">Real options on this field: {activeFieldData.options.join(", ")}</p>
                    )}
                    {!disabled && <MergeFieldPicker label="Insert merge field" groups={pickerGroups} onInsert={insertToken} disabled={!activeField} />}
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <input
                      ref={editorInputRef}
                      type="text"
                      disabled={disabled}
                      value={activeValue}
                      onChange={(e) => setMapping(activeField!, e.target.value)}
                      placeholder="Type text or insert a merge field..."
                      className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                    />
                    {!disabled && <MergeFieldPicker label="Insert merge field" groups={pickerGroups} onInsert={insertToken} disabled={!activeField} />}
                  </div>
                )}
              </div>
            )}
          </div>

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

          <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_260px]">
            <div className="relative inline-block rounded-lg border border-border">
              <canvas ref={canvasRef} className="block max-w-full" />
              {rendered &&
                fieldsOnPage.map((field) => {
                  const mapped = Boolean((templateByPdfField.get(field.name) ?? "").trim());
                  const isActive = field.name === activeField;
                  const isCheckbox = CHECKBOX_TYPES.has(field.type);
                  const admin = looksAdministrative(field.name);
                  const baseColor = admin ? "border-warning" : mapped ? "border-accent" : "border-slate/50";
                  return (
                    <button
                      key={field.name}
                      type="button"
                      title={humanLabel(field)}
                      onClick={() => selectField(field)}
                      style={markerStyle(field)}
                      className={`absolute flex items-center justify-center border-2 transition ${baseColor} ${
                        isActive ? "z-10 ring-2 ring-accent ring-offset-1" : ""
                      } ${
                        isCheckbox
                          ? `rounded-[3px] ${mapped ? "bg-accent/70" : admin ? "bg-warning/20" : "bg-white/40"}`
                          : `rounded-[2px] ${mapped ? "bg-accent/20" : admin ? "bg-warning/10" : "bg-white/20"}`
                      }`}
                    >
                      {isCheckbox &&
                        (mapped ? (
                          <CheckSquare size={Math.max(field.rect.heightPct * 800, 10)} className="text-white" aria-hidden="true" />
                        ) : (
                          <Square size={Math.max(field.rect.heightPct * 800, 10)} className="text-slate/60" aria-hidden="true" />
                        ))}
                    </button>
                  );
                })}
            </div>

            <div className="max-h-[600px] overflow-y-auto rounded-lg border border-border">
              <div className="sticky top-0 flex items-center gap-1.5 border-b border-border bg-surfaceMuted px-2.5 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted">
                <ListTree size={12} /> All fields
              </div>
              <div className="divide-y divide-border">
                {detectedFields.map((field) => {
                  const value = templateByPdfField.get(field.name) ?? "";
                  const mapped = Boolean(value.trim());
                  const isActive = field.name === activeField;
                  const admin = looksAdministrative(field.name);
                  return (
                    <button
                      key={field.name}
                      type="button"
                      ref={(el) => {
                        if (el) rowRefs.current.set(field.name, el);
                        else rowRefs.current.delete(field.name);
                      }}
                      onClick={() => selectField(field)}
                      className={`block w-full px-2.5 py-2 text-left text-xs transition ${isActive ? "bg-accentSoft" : "hover:bg-surfaceMuted"}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-medium text-ink">{humanLabel(field)}</span>
                        <span className="shrink-0 rounded-full border border-border px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-muted">
                          {fieldKindLabel(field.type)}
                        </span>
                      </div>
                      <p className="truncate font-mono text-[10px] text-muted">{field.name}</p>
                      {admin && (
                        <p className="mt-0.5 flex items-center gap-1 text-[10px] text-warning">
                          <AlertTriangle size={10} /> Office-use only?
                        </p>
                      )}
                      {!admin && (
                        <p className={`mt-0.5 truncate text-[10px] ${mapped ? "text-accent" : "text-muted"}`}>
                          {mapped ? value : "Not mapped"}
                        </p>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          {!rendered && <p className="mt-2 text-xs text-muted">Rendering page...</p>}
        </>
      )}
    </div>
  );
}
