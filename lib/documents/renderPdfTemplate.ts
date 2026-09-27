import { PDFDocument, StandardFonts, rgb, PDFTextField, PDFCheckBox, PDFRadioGroup, PDFDropdown, PDFName, PDFString, PDFHexString, PDFDict } from "pdf-lib";
import { renderTemplate } from "@/lib/templates/render";

// `template` is free text that may contain zero or more {{merge_field}}
// tokens (same convention as email/SMS templates) -- not just one bare
// token. This is what lets a field like "Taxpayer name and address" combine
// {{client_name}} and {{client_address}} on one line, or a field that needs
// something no merge field covers (an internal file number, boilerplate
// text) just be typed in directly with no tokens at all.
export type AcroformFieldMapping = { kind: "acroform"; pdfFieldName: string; template: string };
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
      const value = renderTemplate(mapping.template, values);
      try {
        const field = form.getField(mapping.pdfFieldName);
        if (field instanceof PDFCheckBox) {
          // A checkbox has no text to render -- its mapped "template" is
          // just a truthy/falsy merge value (booleans render as "true"/""
          // via renderTemplate). Any of the common truthy spellings checks
          // it; anything else (including an empty/unresolved value) leaves
          // it unchecked rather than the old behavior of always attempting
          // a literal "x", which threw on getTextField() and was silently
          // swallowed by the catch below -- checkboxes never actually got
          // filled at all.
          if (/^(x|true|1|yes|on)$/i.test(value.trim())) field.check();
          else field.uncheck();
        } else if (!value) {
          continue;
        } else if (field instanceof PDFTextField) {
          // Auto-size (font size 0) instead of the field's fixed default --
          // a long value (e.g. a full sentence in a narrow "Specific tax
          // matters" column) would otherwise render at a fixed size and get
          // clipped at the field's edge instead of shrinking to fit. Never
          // hurts a short value, which just renders at its natural size.
          field.setFontSize(0);
          field.setText(value);
        } else if (field instanceof PDFRadioGroup || field instanceof PDFDropdown) {
          field.select(value);
        }
      } catch {
        // The PDF field was renamed/removed since this mapping was set up,
        // or the value doesn't match one of a radio/dropdown's real options
        // -- skip it rather than failing the whole document.
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

export type DetectedPdfField = {
  name: string;
  type: string;
  // Position of the field's first widget on the page, as percentages of the
  // page's own width/height (top-left origin, matching the overlay tool's
  // xPct/yPct convention) -- null when a field has no widget or its owning
  // page couldn't be resolved, so the mapper UI can still list it, just
  // without a visual position to overlay it on.
  page: number | null;
  rect: { xPct: number; yPct: number; widthPct: number; heightPct: number } | null;
  // The PDF spec's standard tooltip/accessible-name entry (/TU) -- a
  // professionally-authored form (IRS's own fillable PDFs included) often
  // embeds a real human-readable description here ("Taxpayer name") distinct
  // from the field's raw, usually-generic internal name (f1_6). Null when
  // absent, which is common for fields with no accessibility text set.
  tooltip: string | null;
  // Real, valid values for a radio group/dropdown/option list -- undefined
  // for a plain text field or checkbox, where it doesn't apply.
  options?: string[];
};

function readFieldTooltip(dict: PDFDict): string | null {
  try {
    const v = dict.lookup(PDFName.of("TU"));
    if (v instanceof PDFString || v instanceof PDFHexString) return v.decodeText();
  } catch {
    // no /TU entry, or it's not a text-like value
  }
  try {
    const parent = dict.lookup(PDFName.of("Parent"));
    if (parent instanceof PDFDict) {
      const v = parent.lookup(PDFName.of("TU"));
      if (v instanceof PDFString || v instanceof PDFHexString) return v.decodeText();
    }
  } catch {
    // no parent, or no /TU on it either
  }
  return null;
}

// Inspects an uploaded PDF for real fillable form fields (AcroForm), for the
// template editor to decide whether to offer the field-mapping list
// ("acroform" mode) or fall back to the click-to-place overlay tool
// ("overlay" mode) for a flat/scanned PDF with none. Also resolves each
// field's on-page position so the mapper can render a real visual overlay
// instead of a bare list of raw field names.
export async function detectPdfFormFields(bytes: Uint8Array): Promise<DetectedPdfField[]> {
  const pdfDoc = await PDFDocument.load(bytes);
  const form = pdfDoc.getForm();
  const pages = pdfDoc.getPages();

  return form.getFields().map((f) => {
    const name = f.getName();
    const type = f.constructor.name;
    const tooltip = readFieldTooltip(f.acroField.dict);
    let options: string[] | undefined;
    if ("getOptions" in f && typeof (f as { getOptions?: unknown }).getOptions === "function") {
      try {
        options = (f as unknown as { getOptions: () => string[] }).getOptions();
      } catch {
        // not actually a choice field, or it has no options
      }
    }
    const widget = f.acroField.getWidgets()[0];
    if (!widget) return { name, type, page: null, rect: null, tooltip, options };

    const ref = pdfDoc.context.getObjectRef(widget.dict);
    const page = ref ? pdfDoc.findPageForAnnotationRef(ref) : undefined;
    if (!page) return { name, type, page: null, rect: null, tooltip, options };

    const pageIndex = pages.indexOf(page);
    const { width: pageWidth, height: pageHeight } = page.getSize();
    const { x, y, width, height } = widget.getRectangle();

    return {
      name,
      options,
      type,
      page: pageIndex,
      rect: {
        xPct: x / pageWidth,
        // PDF widget rects are bottom-left origin; flip to the top-left
        // origin the overlay tool and canvas rendering already use.
        yPct: 1 - (y + height) / pageHeight,
        widthPct: width / pageWidth,
        heightPct: height / pageHeight,
      },
      tooltip,
    };
  });
}

export async function getPdfPageCount(bytes: Uint8Array): Promise<number> {
  const pdfDoc = await PDFDocument.load(bytes);
  return pdfDoc.getPageCount();
}
