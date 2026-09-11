import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { checkRateLimit, clientIp } from "@/lib/rateLimit";
import { renderLetterPdf } from "@/lib/documents/renderLetterPdf";
import { fetchImageBytes } from "@/lib/documents/fetchImageBytes";
import { resolveClientServiceFolder } from "@/lib/documents/resolveClientServiceFolder";

// Called right after a public engagement-letter signature succeeds
// (components/sign/PublicEngagementLetterSign.tsx and the anonymous public
// intake flow at /e/[token]) so the signed letter shows up in the client's
// Documents automatically instead of only living in
// engagement_letter_public_signatures. Re-fetches the already-resolved,
// server-authoritative HTML by signature id rather than trusting anything
// the caller sends -- the caller only proves which signature to file, not
// what it says.
export async function POST(request: Request) {
  const allowed = await checkRateLimit(`file-signed-letter:${clientIp(request)}`, 20, 60);
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests. Try again shortly." }, { status: 429 });
  }

  const { signatureId } = await request.json().catch(() => ({ signatureId: null }));
  if (typeof signatureId !== "string") {
    return NextResponse.json({ error: "signatureId is required" }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { data: signature } = await supabase
    .from("engagement_letter_public_signatures")
    .select(
      "id, workspace_id, client_id, resolved_body_html, filed_as_attachment, signature_type, signature_image_path, typed_name, signer_name, signed_at, engagement_letter_templates(name, banner_image_url)"
    )
    .eq("id", signatureId)
    .maybeSingle();

  if (!signature) {
    return NextResponse.json({ error: "Signature not found" }, { status: 404 });
  }
  if (signature.filed_as_attachment) {
    return NextResponse.json({ ok: true, alreadyFiled: true });
  }

  // Renders a real, standard-Letter-sized, paginated PDF (matching what the
  // client actually paged through when signing) with the real drawn
  // signature embedded, rather than a raw HTML blob -- consistent with the
  // PDF the automation-driven signature-request flow already produces.
  const signedAt = signature.signed_at ? new Date(signature.signed_at).toLocaleString() : "";
  let signatureImageBytes: Uint8Array | null = null;
  if (signature.signature_image_path) {
    const { data: imageBlob } = await supabase.storage.from("signatures").download(signature.signature_image_path);
    if (imageBlob) signatureImageBytes = new Uint8Array(await imageBlob.arrayBuffer());
  }

  const templateInfo = signature.engagement_letter_templates as unknown as { name?: string; banner_image_url?: string | null } | null;
  const templateName = templateInfo?.name ?? "Document";
  const bannerImageBytes = await fetchImageBytes(templateInfo?.banner_image_url);
  const signedBy =
    signatureImageBytes || signature.typed_name
      ? { signatureImageBytes, typedName: signature.typed_name ?? signature.signer_name, signedAtLabel: signedAt }
      : undefined;
  const pdfBytes = await renderLetterPdf(templateName, signature.resolved_body_html, signature.typed_name ?? signature.signer_name, signedBy, bannerImageBytes ?? undefined);

  const fileName = `${templateName} (signed).pdf`;
  const path = `${signature.workspace_id}/${signature.client_id}/${Date.now()}-${fileName}`;
  const blob = new Blob([pdfBytes as unknown as BlobPart], { type: "application/pdf" });

  const { error: uploadErr } = await supabase.storage.from("client-documents").upload(path, blob, { contentType: "application/pdf" });
  if (uploadErr) {
    return NextResponse.json({ error: uploadErr.message }, { status: 500 });
  }

  const folderId = await resolveClientServiceFolder(supabase, signature.workspace_id, signature.client_id);

  const { error: insertErr } = await supabase.from("attachments").insert({
    workspace_id: signature.workspace_id,
    entity_type: "client",
    entity_id: signature.client_id,
    folder_id: folderId,
    file_name: fileName,
    storage_path: path,
    mime_type: "application/pdf",
    file_size_bytes: blob.size,
    visibility: "client_visible",
    category: "Signed Document",
  });
  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  await supabase.from("engagement_letter_public_signatures").update({ filed_as_attachment: true }).eq("id", signatureId);

  return NextResponse.json({ ok: true });
}
