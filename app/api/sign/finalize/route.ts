import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { checkRateLimit, clientIp } from "@/lib/rateLimit";
import { TextPdf } from "@/lib/pdf/textPdf";

// Files a flattened, final signed PDF for the generic (uploaded-document)
// signature-request flow -- mirroring what file-signed-engagement-letter
// already does for engagement letters, but appending a signature
// certificate page onto the real uploaded PDF (TextPdf.fromExisting)
// instead of rendering one from HTML template content.
//
// Called unconditionally right after every successful record_signature/
// record_signature_by_token (see PublicSignView.tsx and
// SignaturesPanel.tsx) rather than only when the caller already knows the
// request just completed -- it's a no-op ("notYetComplete") until the last
// pending signer finishes, and idempotent (final_pdf_attachment_id already
// set => "alreadyFiled") if called again afterwards. Accepts either a
// public signing token (the signer's own proof of access) or an
// authenticated staff caller's signatureRequestId -- unlike the token, a
// bare signatureRequestId is just a database id, not proof of anything, so
// that path requires a real session with 'signatures.request' permission
// on the request's own workspace before any mutation runs.
export async function POST(request: Request) {
  const allowed = await checkRateLimit(`sign-finalize:${clientIp(request)}`, 20, 60);
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests. Try again shortly." }, { status: 429 });
  }

  const body = await request.json().catch(() => ({}));
  const token: string | undefined = body?.token;
  const bodySignatureRequestId: string | undefined = body?.signatureRequestId;
  if (!token && !bodySignatureRequestId) {
    return NextResponse.json({ error: "token or signatureRequestId is required" }, { status: 400 });
  }

  const supabase = createServiceClient();

  let requestId = bodySignatureRequestId ?? null;
  if (!requestId && token) {
    const { data: signer } = await supabase
      .from("signature_request_signers")
      .select("signature_request_id")
      .eq("access_token", token)
      .maybeSingle();
    requestId = signer?.signature_request_id ?? null;
  }
  if (!requestId) {
    return NextResponse.json({ error: "Signature request not found" }, { status: 404 });
  }

  const { data: sigRequest } = await supabase
    .from("signature_requests")
    .select("id, workspace_id, attachment_id, status, final_pdf_attachment_id, title")
    .eq("id", requestId)
    .maybeSingle();
  if (!sigRequest) {
    return NextResponse.json({ error: "Signature request not found" }, { status: 404 });
  }

  // The token path already proved the caller is this request's own signer
  // (the earlier access_token lookup). A bare signatureRequestId proves
  // nothing on its own -- without this, any caller who learned or guessed
  // an id could trigger the service-role mutations below for a signature
  // request belonging to a workspace they have no relationship to.
  if (!token) {
    const sessionClient = createClient();
    const {
      data: { user },
    } = await sessionClient.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const { data: authorized } = await sessionClient.rpc("has_permission", {
      p_workspace_id: sigRequest.workspace_id,
      p_permission_key: "signatures.request",
    });
    if (!authorized) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }
  }

  if (sigRequest.final_pdf_attachment_id) {
    return NextResponse.json({ ok: true, alreadyFiled: true });
  }
  if (sigRequest.status !== "completed") {
    return NextResponse.json({ ok: true, notYetComplete: true });
  }
  if (!sigRequest.attachment_id) {
    return NextResponse.json({ ok: true, noAttachment: true });
  }

  const { data: attachment } = await supabase
    .from("attachments")
    .select("id, workspace_id, entity_type, entity_id, folder_id, file_name, storage_path, mime_type, visibility, category")
    .eq("id", sigRequest.attachment_id)
    .maybeSingle();
  if (!attachment) {
    return NextResponse.json({ error: "Source document not found" }, { status: 404 });
  }

  // Field-level placement/flattening is only meaningful for a real PDF --
  // an image or other upload has nothing to append a certificate page to.
  if (attachment.mime_type !== "application/pdf") {
    return NextResponse.json({ ok: true, unsupportedMimeType: true });
  }

  const { data: signers } = await supabase
    .from("signature_request_signers")
    .select("signer_name, typed_name, signature_image_path, signed_at, sign_order")
    .eq("signature_request_id", requestId)
    .eq("status", "signed")
    .order("sign_order");

  const { data: originalBlob, error: downloadErr } = await supabase.storage.from("client-documents").download(attachment.storage_path);
  if (downloadErr || !originalBlob) {
    return NextResponse.json({ error: downloadErr?.message ?? "Could not load the original document" }, { status: 500 });
  }

  const originalBytes = new Uint8Array(await originalBlob.arrayBuffer());
  const pdf = await TextPdf.fromExisting(originalBytes);
  pdf.heading("Signature Certificate");
  pdf.subtle(sigRequest.title);

  for (const signer of signers ?? []) {
    const name = signer.typed_name ?? signer.signer_name;
    const signedAtLabel = signer.signed_at ? new Date(signer.signed_at).toLocaleString() : "";
    let usedImage = false;
    if (signer.signature_image_path) {
      const { data: imageBlob } = await supabase.storage.from("signatures").download(signer.signature_image_path);
      if (imageBlob) {
        const imageBytes = new Uint8Array(await imageBlob.arrayBuffer());
        await pdf.signatureImage(imageBytes, name, signedAtLabel);
        usedImage = true;
      }
    }
    if (!usedImage) pdf.signatureTyped(name, signedAtLabel);
  }

  const pdfBytes = await pdf.save();
  const fileName = `${attachment.file_name.replace(/\.pdf$/i, "")} (signed).pdf`;
  const path = `${attachment.workspace_id}/${attachment.entity_id}/${Date.now()}-${fileName}`;
  const blob = new Blob([pdfBytes as unknown as BlobPart], { type: "application/pdf" });

  const { error: uploadErr } = await supabase.storage.from("client-documents").upload(path, blob, { contentType: "application/pdf" });
  if (uploadErr) {
    return NextResponse.json({ error: uploadErr.message }, { status: 500 });
  }

  // Filed as a new version of the original (same versioning mechanism
  // DocumentList.tsx's own "upload new version" flow already uses), not an
  // unrelated file -- staff see the flattened, signed PDF as the current
  // version with the original still available in its version history.
  const { data: newAttachment, error: insertErr } = await supabase
    .from("attachments")
    .insert({
      workspace_id: attachment.workspace_id,
      entity_type: attachment.entity_type,
      entity_id: attachment.entity_id,
      folder_id: attachment.folder_id,
      file_name: fileName,
      storage_path: path,
      mime_type: "application/pdf",
      file_size_bytes: blob.size,
      visibility: attachment.visibility,
      category: attachment.category ?? "Signed Document",
      replaces_attachment_id: attachment.id,
      is_locked: true,
    })
    .select("id")
    .single();
  if (insertErr || !newAttachment) {
    return NextResponse.json({ error: insertErr?.message ?? "Could not file the signed document" }, { status: 500 });
  }

  await supabase.from("attachments").update({ is_latest_version: false }).eq("id", attachment.id);
  await supabase.from("signature_requests").update({ final_pdf_attachment_id: newAttachment.id }).eq("id", requestId);

  return NextResponse.json({ ok: true, attachmentId: newAttachment.id });
}
