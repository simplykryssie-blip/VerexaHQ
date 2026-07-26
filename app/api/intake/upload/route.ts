import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/serverAuth";
import { isRateLimited, requestIp } from "@/lib/intakeRateLimit";

// Public, unauthenticated endpoint, gated entirely by the intake return
// token (re-validated via resume_public_intake on every call -- a token
// can only ever reach the single intake it was minted for). Writes go
// through the service-role storage client so the browser never needs, and
// never gets, direct storage credentials or a broadly-scoped RLS policy.
const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;

// Allowlist, not a blocklist -- deliberately excludes anything executable
// (.exe, .js, .sh, .bat, .msi, etc.) or ambiguous. Only what a taxpayer
// would plausibly need to upload for a document request.
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/heif",
  "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
  "text/plain",
]);

function sanitizeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-150);
}

export async function POST(req: NextRequest) {
  const ip = requestIp(req);
  if (isRateLimited(`upload:${ip}`, 20, 10 * 60 * 1000)) {
    return NextResponse.json(
      { ok: false, error: "Too many uploads. Please wait a few minutes and try again." },
      { status: 429 },
    );
  }

  const formData = await req.formData().catch(() => null);
  if (!formData) {
    return NextResponse.json({ ok: false, error: "Invalid upload." }, { status: 400 });
  }

  const token = String(formData.get("token") || "").trim();
  const documentRequestId = String(formData.get("documentRequestId") || "").trim();
  const file = formData.get("file");

  if (!token || !documentRequestId || !(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "Invalid upload." }, { status: 400 });
  }
  if (file.size <= 0 || file.size > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json(
      { ok: false, error: "That file is too large. The limit is 25 MB." },
      { status: 400 },
    );
  }
  const mimeType = file.type || "application/octet-stream";
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    return NextResponse.json(
      { ok: false, error: "That file type isn't accepted. Please upload a PDF, image, Word, Excel, or text file." },
      { status: 400 },
    );
  }

  const service = createServiceClient();

  const { data: intake, error: resumeError } = await service.rpc("resume_public_intake", {
    p_token: token,
  });
  if (resumeError || !intake) {
    return NextResponse.json(
      { ok: false, error: "This link is invalid or has expired." },
      { status: 400 },
    );
  }
  const intakeRow = intake as { id: string; workspace_id: string };

  if (isRateLimited(`upload:intake:${intakeRow.id}`, 40, 10 * 60 * 1000)) {
    return NextResponse.json(
      { ok: false, error: "Too many uploads. Please wait a few minutes and try again." },
      { status: 429 },
    );
  }

  const safeName = sanitizeFileName(file.name || "document");
  const storagePath = `intake/${intakeRow.workspace_id}/${intakeRow.id}/${randomUUID()}-${safeName}`;

  const arrayBuffer = await file.arrayBuffer();
  const { error: uploadError } = await service.storage
    .from("verexahq-client-documents")
    .upload(storagePath, Buffer.from(arrayBuffer), { contentType: mimeType, upsert: false });
  if (uploadError) {
    return NextResponse.json({ ok: false, error: "Could not store that file. Please try again." }, { status: 500 });
  }

  const { data: documentId, error: recordError } = await service.rpc(
    "record_intake_document_upload",
    {
      p_intake_id: intakeRow.id,
      p_document_request_id: documentRequestId,
      p_original_file_name: file.name || safeName,
      p_mime_type: mimeType,
      p_file_size_bytes: file.size,
      p_storage_path: storagePath,
    },
  );
  if (recordError) {
    await service.storage.from("verexahq-client-documents").remove([storagePath]);
    return NextResponse.json({ ok: false, error: recordError.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, documentId });
}
