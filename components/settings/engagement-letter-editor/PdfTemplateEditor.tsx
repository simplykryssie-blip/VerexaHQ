"use client";

import { useEffect, useState } from "react";
import { UploadCloud, FileText } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import { detectPdfFormFields } from "@/lib/documents/renderPdfTemplate";
import type { PdfFieldMapping, AcroformFieldMapping, OverlayFieldMapping, DetectedPdfField } from "@/lib/documents/renderPdfTemplate";
import { AcroFormFieldMapper } from "./AcroFormFieldMapper";
import { OverlayFieldPlacer } from "./OverlayFieldPlacer";

// Orchestrates the "upload a PDF" side of a Document template: uploading the
// file, detecting whether it has real fillable form fields (pdf-lib can
// inspect this client-side, no server round trip needed), and handing off to
// whichever mapping tool applies -- a simple field list for a fillable PDF,
// or the click-to-place tool for a flat one.
export function PdfTemplateEditor({
  workspaceId,
  templateId,
  pdfStoragePath,
  fieldMode,
  fieldMappings,
  onUploaded,
  onFieldMappingsChange,
  disabled,
}: {
  workspaceId: string;
  templateId: string;
  pdfStoragePath: string | null;
  fieldMode: "acroform" | "overlay" | null;
  fieldMappings: PdfFieldMapping[];
  onUploaded: (path: string, fieldMode: "acroform" | "overlay") => void;
  onFieldMappingsChange: (mappings: PdfFieldMapping[]) => void;
  disabled?: boolean;
}) {
  const supabase = createClient();
  const toast = useToast();
  const [uploading, setUploading] = useState(false);
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  const [detectedFields, setDetectedFields] = useState<DetectedPdfField[]>([]);
  const [loadingExisting, setLoadingExisting] = useState(false);

  useEffect(() => {
    if (!pdfStoragePath) return;
    let cancelled = false;
    setLoadingExisting(true);
    supabase.storage
      .from("document-templates")
      .download(pdfStoragePath)
      .then(async ({ data, error }) => {
        if (cancelled) return;
        if (error || !data) {
          toast.show("Could not load the uploaded PDF.", "error");
          return;
        }
        const bytes = new Uint8Array(await data.arrayBuffer());
        setPdfBytes(bytes);
        if (fieldMode === "acroform") setDetectedFields(await detectPdfFormFields(bytes));
      })
      .finally(() => {
        if (!cancelled) setLoadingExisting(false);
      });
    return () => {
      cancelled = true;
    };
    // Only re-fetch when the stored path itself changes (a fresh upload
    // updates state directly instead), not on every fieldMode toggle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfStoragePath]);

  async function handleFile(file: File) {
    if (file.type !== "application/pdf") {
      toast.show("Please choose a PDF file.", "error");
      return;
    }
    setUploading(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      const fields = await detectPdfFormFields(bytes);
      const mode: "acroform" | "overlay" = fields.length > 0 ? "acroform" : "overlay";

      const path = `${workspaceId}/${templateId}-${Date.now()}.pdf`;
      const { error } = await supabase.storage.from("document-templates").upload(path, file, { contentType: "application/pdf" });
      if (error) {
        toast.show(error.message, "error");
        return;
      }

      setPdfBytes(bytes);
      setDetectedFields(fields);
      onFieldMappingsChange([]);
      onUploaded(path, mode);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-border bg-surface shadow-soft p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">Source PDF</p>
        {pdfStoragePath ? (
          <p className="mt-1 flex items-center gap-1.5 text-sm text-slate">
            <FileText size={14} className="text-muted" /> {pdfStoragePath.split("/").pop()}
          </p>
        ) : (
          <p className="mt-1 text-sm text-muted">No PDF uploaded yet.</p>
        )}
        {!disabled && (
          <label className="mt-2 inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-slate hover:border-accent hover:text-accent">
            <UploadCloud size={14} />
            {uploading ? "Uploading..." : pdfStoragePath ? "Replace PDF" : "Upload PDF"}
            <input
              type="file"
              accept="application/pdf"
              className="hidden"
              disabled={uploading}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
                e.target.value = "";
              }}
            />
          </label>
        )}
      </div>

      {loadingExisting && <p className="text-xs text-muted">Loading uploaded PDF...</p>}

      {pdfBytes && fieldMode === "acroform" && (
        <AcroFormFieldMapper
          pdfBytes={pdfBytes}
          detectedFields={detectedFields}
          mappings={fieldMappings.filter((m): m is AcroformFieldMapping => m.kind === "acroform")}
          onChange={onFieldMappingsChange}
          disabled={disabled}
        />
      )}
      {pdfBytes && fieldMode === "overlay" && (
        <OverlayFieldPlacer
          pdfBytes={pdfBytes}
          mappings={fieldMappings.filter((m): m is OverlayFieldMapping => m.kind === "overlay")}
          onChange={onFieldMappingsChange}
          disabled={disabled}
        />
      )}
    </div>
  );
}
