import { TextPdf } from "@/lib/pdf/textPdf";
import { PAGE_BREAK_HTML_RE } from "@/lib/documents/pageBreakSplit";

// Templates are authored as body_html (a simple rich-text editor's output --
// paragraphs, line breaks, the occasional list, an explicit page break), not
// full page-layout HTML, so a crude block-to-paragraph conversion is enough
// to get readable text into the PDF without pulling in a full HTML renderer.
export const PAGE_BREAK_SENTINEL = "@@PAGE_BREAK@@";

function htmlToParagraphs(html: string): string[] {
  const withBreaks = (html ?? "")
    // A page break (lib/tiptap/pageBreak.ts) serializes as an empty
    // <div data-page-break>; must be swapped out before the generic
    // </div> -> blank-line rule below would otherwise eat it silently.
    .replace(PAGE_BREAK_HTML_RE, `\n\n${PAGE_BREAK_SENTINEL}\n\n`)
    // Table cells have no block-level separator of their own -- without this,
    // adjacent cells in a row would run together with no space between them.
    .replace(/<\/(td|th)>/gi, " | ")
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ");
  const stripped = withBreaks.replace(/<[^>]+>/g, "");
  const decoded = stripped
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/gi, "'");

  return decoded
    .split(/\n\s*\n/)
    .map((p) => p.replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, " ").trim())
    .filter(Boolean);
}

// Renders a merge-field-substituted engagement letter template as an actual
// PDF -- with a visible signature line at the end -- instead of the raw
// HTML blob that used to get uploaded. The signing page can only preview
// PDFs and images, so an HTML attachment never actually rendered there: the
// signer saw "preview not available" and a bare "type your name" box with
// no visible connection to any document, let alone a signature line.
//
// Pass `signedBy` for an already-signed document (e.g. filing a completed
// public-link signature) to embed the real signature instead of a blank
// "sign here" line -- the drawn image when the signer drew one, or the
// typed name rendered as text when they typed instead.
export async function renderLetterPdf(
  title: string,
  bodyHtml: string,
  signerLabel: string,
  signedBy?: { signatureImageBytes: Uint8Array | null; typedName: string; signedAtLabel: string },
  bannerImageBytes?: Uint8Array
): Promise<Uint8Array> {
  const pdf = await TextPdf.create();
  if (bannerImageBytes) {
    await pdf.headerImage(bannerImageBytes);
  }
  pdf.heading(title);
  for (const paragraph of htmlToParagraphs(bodyHtml)) {
    if (paragraph === PAGE_BREAK_SENTINEL) {
      pdf.newPage();
      continue;
    }
    pdf.paragraph(paragraph);
  }
  pdf.spacer(20);
  if (signedBy?.signatureImageBytes) {
    await pdf.signatureImage(signedBy.signatureImageBytes, signedBy.typedName, signedBy.signedAtLabel);
  } else if (signedBy?.typedName) {
    pdf.signatureTyped(signedBy.typedName, signedBy.signedAtLabel);
  } else {
    pdf.signatureLine(`Signature -- ${signerLabel}`);
  }
  return pdf.save();
}
