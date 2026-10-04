import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sniffDocumentMimeType, MAX_DOCUMENT_UPLOAD_BYTES } from "@/lib/documents/sniffDocumentMimeType";

// P10-02: UploadZone's "upload a document" and DocumentList's "upload a new
// version" previously called supabase.storage.upload() and
// attachments.insert() straight from the browser, trusting the File
// object's own .type and .size for both the stored object's Content-Type
// and the attachments.mime_type/file_size_bytes columns -- values the
// caller fully controls and that are never actually checked against the
// bytes being uploaded.
//
// This route is the one place those two calls now happen, so the real
// bytes can be inspected first -- but it runs as the caller's own session
// (createClient() from lib/supabase/server, not the service-role client),
// so it is bound by exactly the same client_documents_storage_insert /
// client_documents_storage_portal_insert / _firm_connection_insert and
// attachments_insert RLS policies a direct browser call already was. This
// adds a content-sniffing layer; it does not change who is allowed to
// upload what.
export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const form = await request.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "Invalid upload" }, { status: 400 });
  }

  const file = form.get("file");
  const workspaceId = form.get("workspaceId");
  const entityType = form.get("entityType");
  const entityId = form.get("entityId");
  if (!(file instanceof File) || typeof workspaceId !== "string" || typeof entityType !== "string" || typeof entityId !== "string") {
    return NextResponse.json({ error: "file, workspaceId, entityType, and entityId are required" }, { status: 400 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length === 0) {
    return NextResponse.json({ error: "The selected file is empty" }, { status: 400 });
  }
  if (bytes.length > MAX_DOCUMENT_UPLOAD_BYTES) {
    return NextResponse.json({ error: "Files must be 25MB or smaller" }, { status: 400 });
  }
  const mimeType = sniffDocumentMimeType(bytes);

  const replacesAttachmentIdField = form.get("replacesAttachmentId");
  const replacesAttachmentId = typeof replacesAttachmentIdField === "string" && replacesAttachmentIdField ? replacesAttachmentIdField : null;

  let folderId: string | null = null;
  let category: string | null = null;
  let version = 1;
  let visibility: string | null = null;

  if (replacesAttachmentId) {
    // Re-fetch the authoritative current row through the caller's own
    // session -- gated by the same client_documents_select RLS the rest of
    // this route relies on -- instead of trusting client-supplied
    // folder/category/version for the row being replaced.
    const { data: existing, error: existingError } = await supabase
      .from("attachments")
      .select("id, workspace_id, entity_type, entity_id, folder_id, category, version")
      .eq("id", replacesAttachmentId)
      .maybeSingle();
    if (existingError || !existing) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }
    folderId = existing.folder_id;
    category = existing.category;
    version = (existing.version ?? 1) + 1;
  } else {
    const folderIdField = form.get("folderId");
    const categoryField = form.get("category");
    const visibilityField = form.get("visibility");
    folderId = typeof folderIdField === "string" && folderIdField ? folderIdField : null;
    category = typeof categoryField === "string" && categoryField ? categoryField : null;
    visibility = typeof visibilityField === "string" && visibilityField ? visibilityField : null;
  }

  const path = `${workspaceId}/${entityId}/${Date.now()}-${file.name}`;
  const { error: uploadError } = await supabase.storage.from("client-documents").upload(path, bytes, { contentType: mimeType });
  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 400 });
  }

  const baseRow = {
    workspace_id: workspaceId,
    entity_type: entityType,
    entity_id: entityId,
    folder_id: folderId,
    category,
    file_name: file.name,
    storage_path: path,
    mime_type: mimeType,
    file_size_bytes: bytes.length,
    uploaded_by: user.id,
  };
  // Only a fresh upload sets visibility explicitly -- a replacement leaves
  // it unset (matching the attachments.visibility column's own 'internal'
  // default), exactly as the direct-from-browser insert did before this
  // route existed.
  const { data: attachment, error: insertError } = await supabase
    .from("attachments")
    .insert(
      replacesAttachmentId ? { ...baseRow, replaces_attachment_id: replacesAttachmentId, version } : { ...baseRow, visibility: visibility ?? "internal" }
    )
    .select("id")
    .single();
  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 400 });
  }

  if (replacesAttachmentId) {
    await supabase.from("attachments").update({ is_latest_version: false }).eq("id", replacesAttachmentId);
  }

  return NextResponse.json({ ok: true, attachment: { id: attachment.id, mimeType, fileSizeBytes: bytes.length } });
}
