import { TextPdf } from "@/lib/pdf/textPdf";

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
    .replace(/<div[^>]*\bdata-page-break\b[^>]*>[\s\S]*?<\/div>|<div[^>]*\bdata-page-break\b[^>]*\/?>/gi, `\n\n${PAGE_BREAK_SENTINEL}\n\n`)
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
export async function renderLetterPdf(title: string, bodyHtml: string, signerLabel: string): Promise<Uint8Array> {
  const pdf = await TextPdf.create();
  pdf.heading(title);
  for (const paragraph of htmlToParagraphs(bodyHtml)) {
    if (paragraph === PAGE_BREAK_SENTINEL) {
      pdf.newPage();
      continue;
    }
    pdf.paragraph(paragraph);
  }
  pdf.spacer(20);
  pdf.signatureLine(`Signature -- ${signerLabel}`);
  return pdf.save();
}
