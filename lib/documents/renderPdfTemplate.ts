import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export type AcroformFieldMapping = { kind: "acroform"; pdfFieldName: string; mergeField: string };
export type OverlayFieldMapping = { kind: "overlay"; mergeField: string; page: number; xPct: number; yPct: number; fontSize: number };
export type PdfFieldMapping = AcroformFieldMapping | OverlayFieldMapping;

// Fills a Document template's uploaded source PDF with resolved merge-field
// values -- either into the PDF's own fillable form fields ("acroform" mode)
// or by drawing text at staff-placed coordinates on a flat PDF ("overlay"
// mode, set via the click-to-place tool in the template editor). Produces
// the document that gets attached to a signature request.
//
// Signing itself is untouched here: record_signature_by_token never
// re-renders the attachment with a signature baked in -- who signed and when
// lives on signature_request_signers, and the original attachment is just
// locked once everyone has signed. A PDF-mode document behaves the same way
// a rich-text one (renderLetterPdf) already does.
export async function renderPdfTemplate({
  sourceBytes,
  fieldMode,
  fieldMappings,
  values,
}: {
  sourceBytes: Uint8Array;
  fieldMode: "acroform" | "overlay";
  fieldMappings: PdfFieldMapping[];
  values: Record<string, string>;
}): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(sourceBytes);

  if (fieldMode === "acroform") {
    const form = pdfDoc.getForm();
    for (const mapping of fieldMappings) {
      if (mapping.kind !== "acroform") continue;
      const value = values[mapping.mergeField];
      if (!value) continue;
      try {
        form.getTextField(mapping.pdfFieldName).setText(value);
      } catch {
        // The PDF field was renamed or removed since this mapping was set
        // up -- skip it rather than failing the whole document.
      }
    }
    form.flatten();
  } else {
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const pages = pdfDoc.getPages();
    for (const mapping of fieldMappings) {
      if (mapping.kind !== "overlay") continue;
      const value = values[mapping.mergeField];
      if (!value) continue;
      const page = pages[mapping.page];
      if (!page) continue;
      const { width, height } = page.getSize();
      page.drawText(value, {
        x: mapping.xPct * width,
        y: height - mapping.yPct * height,
        size: mapping.fontSize,
        font,
        color: rgb(0, 0, 0),
      });
    }
  }

  return pdfDoc.save();
}

// Inspects an uploaded PDF for real fillable form fields (AcroForm), for the
// template editor to decide whether to offer the field-mapping list
// ("acroform" mode) or fall back to the click-to-place overlay tool
// ("overlay" mode) for a flat/scanned PDF with none.
export async function detectPdfFormFields(bytes: Uint8Array): Promise<{ name: string; type: string }[]> {
  const pdfDoc = await PDFDocument.load(bytes);
  const form = pdfDoc.getForm();
  return form.getFields().map((f) => ({ name: f.getName(), type: f.constructor.name }));
}

export async function getPdfPageCount(bytes: Uint8Array): Promise<number> {
  const pdfDoc = await PDFDocument.load(bytes);
  return pdfDoc.getPageCount();
}
