"use client";

import { ALL_MERGE_FIELDS } from "@/lib/mergeFields";
import type { AcroformFieldMapping } from "@/lib/documents/renderPdfTemplate";

// Lists the PDF's own fillable fields (detected via pdf-lib when the file
// was uploaded) and lets staff map each one to a merge field -- no visual
// placement needed since the PDF already knows where each field sits on the
// page.
export function AcroFormFieldMapper({
  detectedFields,
  mappings,
  onChange,
  disabled,
}: {
  detectedFields: { name: string; type: string }[];
  mappings: AcroformFieldMapping[];
  onChange: (mappings: AcroformFieldMapping[]) => void;
  disabled?: boolean;
}) {
  const mergeFieldByPdfField = new Map(mappings.map((m) => [m.pdfFieldName, m.mergeField]));

  function setMapping(pdfFieldName: string, mergeField: string) {
    const next = mappings.filter((m) => m.pdfFieldName !== pdfFieldName);
    if (mergeField) next.push({ kind: "acroform", pdfFieldName, mergeField });
    onChange(next);
  }

  if (detectedFields.length === 0) {
    return <p className="text-xs text-muted">This PDF has no fillable form fields.</p>;
  }

  return (
    <div className="rounded-2xl border border-border bg-surface shadow-soft p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">Map PDF fields to merge fields</p>
      <p className="mt-1 text-xs text-muted">
        {detectedFields.length} fillable field{detectedFields.length === 1 ? "" : "s"} found in this PDF. Choose what fills each one when
        it&apos;s sent -- leave any field unmapped to leave it blank.
      </p>
      <div className="mt-3 space-y-2">
        {detectedFields.map((f) => (
          <div key={f.name} className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-ink">{f.name}</p>
              <p className="text-[11px] text-muted">{f.type.replace(/^PDF/, "")}</p>
            </div>
            <select
              disabled={disabled}
              value={mergeFieldByPdfField.get(f.name) ?? ""}
              onChange={(e) => setMapping(f.name, e.target.value)}
              className="w-56 shrink-0 rounded-lg border border-border px-2 py-1.5 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
            >
              <option value="">Leave blank</option>
              {ALL_MERGE_FIELDS.map((mf) => (
                <option key={mf.token} value={mf.token}>
                  {mf.label}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
    </div>
  );
}
