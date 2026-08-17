import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { checkRateLimit, clientIp } from "@/lib/rateLimit";

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
      "id, workspace_id, client_id, resolved_body_html, filed_as_attachment, signature_type, signature_image_path, typed_name, signed_at, engagement_letter_templates(name)"
    )
    .eq("id", signatureId)
    .maybeSingle();

  if (!signature) {
    return NextResponse.json({ error: "Signature not found" }, { status: 404 });
  }
  if (signature.filed_as_attachment) {
    return NextResponse.json({ ok: true, alreadyFiled: true });
  }

  // The stored letter body has no visible signature of its own -- append one
  // so the filed document actually shows what the client signed with,
  // instead of just the letter text plus a database row nobody sees.
  const signedAt = signature.signed_at ? new Date(signature.signed_at).toLocaleString() : "";
  let signatureBlockHtml = "";
  if (signature.signature_type === "drawn" && signature.signature_image_path) {
    const { data: imageBytes } = await supabase.storage.from("signatures").download(signature.signature_image_path);
    if (imageBytes) {
      const base64 = Buffer.from(await imageBytes.arrayBuffer()).toString("base64");
      signatureBlockHtml = `<div style="margin-top:2em"><img src="data:image/png;base64,${base64}" alt="Signature" style="max-width:300px;display:block" /><p style="color:#64748b;font-size:0.8em;margin-top:4px">Signed ${signedAt}</p></div>`;
    }
  } else if (signature.typed_name) {
    const escapedName = signature.typed_name.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    signatureBlockHtml = `<div style="margin-top:2em"><p style="font-family:cursive;font-size:1.4em;border-bottom:1px solid #0f172a;display:inline-block;padding-bottom:4px">${escapedName}</p><p style="color:#64748b;font-size:0.8em;margin-top:4px">Signed ${signedAt}</p></div>`;
  }

  const templateName = (signature.engagement_letter_templates as unknown as { name?: string } | null)?.name ?? "Engagement Letter";
  const fileName = `${templateName} (signed).html`;
  const path = `${signature.workspace_id}/${signature.client_id}/${Date.now()}-${fileName}`;
  const blob = new Blob([signature.resolved_body_html + signatureBlockHtml], { type: "text/html" });

  const { error: uploadErr } = await supabase.storage.from("client-documents").upload(path, blob, { contentType: "text/html" });
  if (uploadErr) {
    return NextResponse.json({ error: uploadErr.message }, { status: 500 });
  }

  const { error: insertErr } = await supabase.from("attachments").insert({
    workspace_id: signature.workspace_id,
    entity_type: "client",
    entity_id: signature.client_id,
    file_name: fileName,
    storage_path: path,
    mime_type: "text/html",
    file_size_bytes: blob.size,
    visibility: "client_visible",
    category: "Engagement Letter",
  });
  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  await supabase.from("engagement_letter_public_signatures").update({ filed_as_attachment: true }).eq("id", signatureId);

  return NextResponse.json({ ok: true });
}
