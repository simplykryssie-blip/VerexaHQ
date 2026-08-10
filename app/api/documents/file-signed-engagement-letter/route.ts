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
    .select("id, workspace_id, client_id, resolved_body_html, filed_as_attachment, engagement_letter_templates(name)")
    .eq("id", signatureId)
    .maybeSingle();

  if (!signature) {
    return NextResponse.json({ error: "Signature not found" }, { status: 404 });
  }
  if (signature.filed_as_attachment) {
    return NextResponse.json({ ok: true, alreadyFiled: true });
  }

  const templateName = (signature.engagement_letter_templates as unknown as { name?: string } | null)?.name ?? "Engagement Letter";
  const fileName = `${templateName} (signed).html`;
  const path = `${signature.workspace_id}/${signature.client_id}/${Date.now()}-${fileName}`;
  const blob = new Blob([signature.resolved_body_html], { type: "text/html" });

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
