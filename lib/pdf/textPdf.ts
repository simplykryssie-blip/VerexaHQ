import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

export const PAGE_WIDTH = 612; // US Letter, points
export const PAGE_HEIGHT = 792;
export const MARGIN = 50;
export const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const LINE_HEIGHT = 13;

// StandardFonts only support WinAnsi-encodable characters -- free-text
// content (an emoji, a non-Latin name) would otherwise throw and fail
// whatever request triggered the PDF, so anything outside that range is
// dropped to "?" rather than crashing.
export function sanitizeForPdf(text: string): string {
  return Array.from(text)
    .map((ch) => {
      const code = ch.codePointAt(0) ?? 0;
      return code >= 0x20 && code <= 0xff && code !== 0x7f ? ch : "?";
    })
    .join("");
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && font.widthOfTextAtSize(candidate, size) > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

// Small stateful wrapper around pdf-lib for simple, paginated, text-only
// documents (organizer summaries, rendered letter templates) -- handles
// page breaks and font embedding once so callers just describe content.
export class TextPdf {
  private pdfDoc: PDFDocument;
  private font: PDFFont;
  private fontBold: PDFFont;
  private page: PDFPage;
  private y: number;

  private constructor(pdfDoc: PDFDocument, font: PDFFont, fontBold: PDFFont) {
    this.pdfDoc = pdfDoc;
    this.font = font;
    this.fontBold = fontBold;
    this.page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    this.y = PAGE_HEIGHT - MARGIN;
  }

  static async create(): Promise<TextPdf> {
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    return new TextPdf(pdfDoc, font, fontBold);
  }

  private ensureSpace(needed: number) {
    if (this.y - needed < MARGIN) {
      this.page = this.pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      this.y = PAGE_HEIGHT - MARGIN;
    }
  }

  heading(text: string, size = 18) {
    this.ensureSpace(size + 2);
    this.page.drawText(sanitizeForPdf(text), { x: MARGIN, y: this.y - size, size, font: this.fontBold, color: rgb(0.1, 0.1, 0.1) });
    this.y -= size + 14;
  }

  subtle(text: string) {
    this.ensureSpace(LINE_HEIGHT);
    this.page.drawText(sanitizeForPdf(text), { x: MARGIN, y: this.y - 10, size: 10, font: this.font, color: rgb(0.45, 0.45, 0.45) });
    this.y -= LINE_HEIGHT + 14;
  }

  labelValueRow(label: string, value: string) {
    const cleanLabel = sanitizeForPdf(label);
    const valueLines = wrapText(sanitizeForPdf(value), this.font, 10, CONTENT_WIDTH);

    this.ensureSpace(LINE_HEIGHT);
    this.page.drawText(cleanLabel, { x: MARGIN, y: this.y - 10, size: 10, font: this.fontBold, color: rgb(0.1, 0.1, 0.1) });
    this.y -= LINE_HEIGHT + 1;

    for (const line of valueLines) {
      this.ensureSpace(LINE_HEIGHT);
      this.page.drawText(line, { x: MARGIN, y: this.y - 10, size: 10, font: this.font, color: rgb(0.25, 0.25, 0.25) });
      this.y -= LINE_HEIGHT;
    }

    this.y -= 6;
    this.ensureSpace(1);
    this.page.drawLine({ start: { x: MARGIN, y: this.y }, end: { x: PAGE_WIDTH - MARGIN, y: this.y }, thickness: 0.5, color: rgb(0.9, 0.9, 0.9) });
    this.y -= 8;
  }

  paragraph(text: string, size = 11) {
    const lines = wrapText(sanitizeForPdf(text), this.font, size, CONTENT_WIDTH);
    for (const line of lines) {
      this.ensureSpace(size + 4);
      this.page.drawText(line, { x: MARGIN, y: this.y - size, size, font: this.font, color: rgb(0.15, 0.15, 0.15) });
      this.y -= size + 4;
    }
    this.y -= 8;
  }

  spacer(amount: number) {
    this.y -= amount;
  }

  // Forces a fresh page regardless of how much room is left on the current
  // one -- for an explicit page-break marker in the source content, as
  // opposed to ensureSpace()'s automatic break when a page just runs out.
  newPage() {
    this.page = this.pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    this.y = PAGE_HEIGHT - MARGIN;
  }

  // A visible "sign here" line + label, e.g. for the bottom of a rendered
  // engagement letter -- keeps to the same page unless there's truly no
  // room left, rather than starting a fresh page for two lines of text.
  signatureLine(label: string) {
    this.ensureSpace(70);
    this.y -= 20;
    this.page.drawLine({ start: { x: MARGIN, y: this.y }, end: { x: MARGIN + 260, y: this.y }, thickness: 0.8, color: rgb(0.2, 0.2, 0.2) });
    this.y -= 12;
    this.page.drawText(sanitizeForPdf(label), { x: MARGIN, y: this.y, size: 9, font: this.font, color: rgb(0.45, 0.45, 0.45) });
    this.y -= 26;
    this.page.drawLine({ start: { x: MARGIN, y: this.y }, end: { x: MARGIN + 260, y: this.y }, thickness: 0.8, color: rgb(0.2, 0.2, 0.2) });
    this.y -= 12;
    this.page.drawText("Date", { x: MARGIN, y: this.y, size: 9, font: this.font, color: rgb(0.45, 0.45, 0.45) });
    this.y -= 16;
  }

  async save(): Promise<Uint8Array> {
    return this.pdfDoc.save();
  }
}
