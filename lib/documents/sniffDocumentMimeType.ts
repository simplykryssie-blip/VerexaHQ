// P10-02: the client-documents upload/replace flow previously stored
// whatever Content-Type the browser's File.type happened to report, and
// used that same client-asserted value both as the Supabase Storage
// object's Content-Type and as attachments.mime_type -- which PreviewPanel
// then trusts to decide HOW to render the file (an iframe for
// "application/pdf"/"text/html", a plain <img> for "image/*"). A caller
// could declare any byte stream as "text/html" and have it embedded in an
// iframe the next time any staff member or client previewed it, or as
// "image/svg+xml" rendered inline -- both script-capable in a browser.
//
// This never reads the caller's declared type at all. It looks at the
// actual bytes and returns one of a small set of types PreviewPanel
// already renders safely:
//   - a real raster image (PNG/JPEG/GIF/WEBP) -- safe in an <img>, which
//     never executes script even for a crafted image.
//   - a real PDF (%PDF- magic) -- the one iframe-rendered type that's
//     actually backed by verified bytes.
//   - plain text with no HTML/script markup -- rendered as literal text in
//     a <pre>, never parsed as markup.
// Anything else -- including a real HTML or SVG document, and any format
// this function doesn't specifically recognize (docx, xlsx, zip, legacy
// .doc, etc.) -- becomes "application/octet-stream", which browsers always
// treat as an opaque download, never inline markup. That already matches
// how those files render today: PreviewPanel has never special-cased them,
// so they only ever showed a "download to view" link.
const HTML_MARKERS = [/<\s*html/i, /<\s*script/i, /<!doctype\s+html/i, /<\s*svg/i, /<\s*iframe/i];

function matchesBytes(bytes: Uint8Array, offset: number, expected: number[]): boolean {
  if (bytes.length < offset + expected.length) return false;
  for (let i = 0; i < expected.length; i++) {
    if (bytes[offset + i] !== expected[i]) return false;
  }
  return true;
}

function looksLikeText(bytes: Uint8Array): string | null {
  // A NUL byte (or most other C0 control bytes besides whitespace) in the
  // sampled prefix means this isn't text, whatever the declared type says.
  const sample = bytes.subarray(0, Math.min(bytes.length, 8192));
  for (const byte of sample) {
    if (byte === 0) return null;
    if (byte < 0x09 && byte !== 0x0a && byte !== 0x0d) return null;
  }
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(sample);
  } catch {
    return null;
  }
  if (HTML_MARKERS.some((marker) => marker.test(text))) return null;
  return "text/plain";
}

export function sniffDocumentMimeType(bytes: Uint8Array): string {
  if (matchesBytes(bytes, 0, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf"; // "%PDF-"
  if (matchesBytes(bytes, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (matchesBytes(bytes, 0, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (matchesBytes(bytes, 0, [0x47, 0x49, 0x46, 0x38, 0x37, 0x61]) || matchesBytes(bytes, 0, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61])) {
    return "image/gif"; // "GIF87a" / "GIF89a"
  }
  if (matchesBytes(bytes, 0, [0x52, 0x49, 0x46, 0x46]) && matchesBytes(bytes, 8, [0x57, 0x45, 0x42, 0x50])) {
    return "image/webp"; // "RIFF"....{size}"WEBP"
  }
  return looksLikeText(bytes) ?? "application/octet-stream";
}

// Mirrors the client-documents Storage bucket's own enforced
// file_size_limit (26214400 bytes / 25MB) so an oversized upload is
// rejected with a clear error from this route instead of an opaque storage
// error -- Storage itself remains the backstop either way.
export const MAX_DOCUMENT_UPLOAD_BYTES = 25 * 1024 * 1024;
