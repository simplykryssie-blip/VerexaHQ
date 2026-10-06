// P10-02: proves the document-upload MIME sniffer derives its answer from
// real bytes only, never a caller-supplied label -- and specifically that
// no input produces "text/html" or "image/svg+xml" (the two types
// PreviewPanel/the browser would otherwise render as live, script-capable
// markup instead of an opaque download).
import { describe, expect, it } from "vitest";
import { sniffDocumentMimeType, MAX_DOCUMENT_UPLOAD_BYTES } from "@/lib/documents/sniffDocumentMimeType";

function bytesOf(values: number[]): Uint8Array {
  return new Uint8Array(values);
}

function textBytes(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

describe("sniffDocumentMimeType (P10-02)", () => {
  it("recognizes a real PDF by its %PDF- magic bytes", () => {
    const pdf = textBytes("%PDF-1.7\n%%EOF");
    expect(sniffDocumentMimeType(pdf)).toBe("application/pdf");
  });

  it("recognizes a real PNG by its 8-byte signature", () => {
    const png = bytesOf([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
    expect(sniffDocumentMimeType(png)).toBe("image/png");
  });

  it("recognizes a real JPEG by its SOI marker", () => {
    const jpeg = bytesOf([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    expect(sniffDocumentMimeType(jpeg)).toBe("image/jpeg");
  });

  it("recognizes a real GIF (GIF89a)", () => {
    const gif = new Uint8Array([...textBytes("GIF89a"), 0x00, 0x00]);
    expect(sniffDocumentMimeType(gif)).toBe("image/gif");
  });

  it("recognizes a real WEBP (RIFF....WEBP)", () => {
    const webp = new Uint8Array([
      ...textBytes("RIFF"),
      0x24,
      0x00,
      0x00,
      0x00, // chunk size, irrelevant to sniffing
      ...textBytes("WEBP"),
    ]);
    expect(sniffDocumentMimeType(webp)).toBe("image/webp");
  });

  it("classifies plain text with no markup as text/plain", () => {
    const txt = textBytes("Client name,Amount\nJane Doe,1200.00\n");
    expect(sniffDocumentMimeType(txt)).toBe("text/plain");
  });

  it("never classifies a real HTML document as text/html -- it falls back to application/octet-stream", () => {
    const html = textBytes("<!DOCTYPE html><html><body><script>alert(document.cookie)</script></body></html>");
    const result = sniffDocumentMimeType(html);
    expect(result).not.toBe("text/html");
    expect(result).toBe("application/octet-stream");
  });

  it("never classifies a real SVG document as image/svg+xml -- it falls back to application/octet-stream", () => {
    const svg = textBytes('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    const result = sniffDocumentMimeType(svg);
    expect(result).not.toBe("image/svg+xml");
    expect(result).toBe("application/octet-stream");
  });

  it("classifies a PNG-named file whose real bytes are HTML as application/octet-stream, not image/png", () => {
    // Simulates a caller renaming/mislabeling an HTML payload as a .png --
    // the sniffer only ever looks at bytes, so the filename/declared type
    // never enters into it.
    const fakePng = textBytes("<html><body>not actually a png</body></html>");
    expect(sniffDocumentMimeType(fakePng)).toBe("application/octet-stream");
  });

  it("classifies an unrecognized binary format (e.g. a zip-based .docx) as application/octet-stream", () => {
    const zipMagic = bytesOf([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00, 0x00, 0x00]);
    expect(sniffDocumentMimeType(zipMagic)).toBe("application/octet-stream");
  });

  it("treats binary content containing NUL bytes as octet-stream even if it has no recognized magic", () => {
    const binary = bytesOf([0x01, 0x00, 0x02, 0x00, 0x03]);
    expect(sniffDocumentMimeType(binary)).toBe("application/octet-stream");
  });

  it("exposes the same 25MB cap the client-documents Storage bucket itself enforces", () => {
    expect(MAX_DOCUMENT_UPLOAD_BYTES).toBe(25 * 1024 * 1024);
  });
});
