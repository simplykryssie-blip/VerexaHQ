import { createServiceClient } from "@/lib/supabase/service";

const MIME_TO_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/svg+xml": "svg",
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
};

// SVG is a heuristic deny-list, not a real sanitizer -- there is no SVG
// sanitization library anywhere in this codebase to reuse. It catches the
// common script-injection vectors (inline <script>, event handler
// attributes, javascript: URIs, embedded foreign/iframe content) without
// claiming to be exhaustive.
const SVG_DENY_PATTERNS = [/<script/i, /\bon\w+\s*=/i, /javascript:/i, /<foreignobject/i, /<iframe/i];

/** Sniffs real file content against its declared MIME type -- never trusts
 * the browser-supplied Content-Type/extension alone. Returns the
 * confirmed MIME type, or null if the content doesn't match anything this
 * field is allowed to accept. */
export function sniffFileType(bytes: Uint8Array, declaredType: string, textContent?: string): string | null {
  const isPng = bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  const isJpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isPdf = bytes.length >= 5 && String.fromCharCode(...bytes.slice(0, 5)) === "%PDF-";
  const isZip = bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
  const isSvg = typeof textContent === "string" && /<svg[\s>]/i.test(textContent.slice(0, 2048));

  if (declaredType === "image/png" && isPng) return "image/png";
  if (declaredType === "image/jpeg" && isJpeg) return "image/jpeg";
  if (declaredType === "application/pdf" && isPdf) return "application/pdf";
  if (declaredType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" && isZip) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  if (declaredType === "image/svg+xml" && isSvg) return "image/svg+xml";
  return null;
}

export function containsSuspiciousSvgContent(text: string): boolean {
  return SVG_DENY_PATTERNS.some((pattern) => pattern.test(text));
}

export async function uploadDigitalProductIntakeFile(
  supabase: ReturnType<typeof createServiceClient>,
  params: {
    workspaceId: string;
    formId: string;
    uploadSessionId: string;
    accept: string[];
    maxSizeBytes: number;
    bytes: Uint8Array;
    declaredType: string;
  }
): Promise<{ path: string } | { error: string }> {
  const { workspaceId, formId, uploadSessionId, accept, maxSizeBytes, bytes, declaredType } = params;

  if (!/^[0-9a-f-]{36}$/i.test(uploadSessionId)) {
    return { error: "Invalid upload session" };
  }
  if (bytes.length === 0) {
    return { error: "File is empty" };
  }
  if (bytes.length > maxSizeBytes) {
    return { error: "File is too large" };
  }
  if (!accept.includes(declaredType)) {
    return { error: "File type is not accepted for this field" };
  }

  let textContent: string | undefined;
  if (declaredType === "image/svg+xml") {
    textContent = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  }

  const confirmedType = sniffFileType(bytes, declaredType, textContent);
  if (!confirmedType) {
    return { error: "File content does not match its declared type" };
  }
  if (confirmedType === "image/svg+xml" && textContent && containsSuspiciousSvgContent(textContent)) {
    return { error: "This SVG file contains content that is not allowed" };
  }

  const ext = MIME_TO_EXT[confirmedType];
  const path = `${workspaceId}/${formId}/${uploadSessionId}/${Date.now()}-${crypto.randomUUID()}.${ext}`;

  const { error } = await supabase.storage.from("digital-product-intake").upload(path, bytes, { contentType: confirmedType });
  if (error) {
    return { error: "Upload failed" };
  }

  return { path };
}
