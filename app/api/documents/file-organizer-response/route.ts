import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { checkRateLimit, clientIp } from "@/lib/rateLimit";
import { formatAddressValue, formatNameValue } from "@/lib/organizer/formatValue";
import { TextPdf } from "@/lib/pdf/textPdf";
import { resolveClientServiceFolder } from "@/lib/documents/resolveClientServiceFolder";

function displayValue(fieldType: string, raw: unknown): string {
  if (raw === null || raw === undefined || raw === "") return "--";
  // ssn/ein are permission-gated + audit-logged via reveal_organizer_answer()
  // everywhere else in the app -- the filed summary must not become a way
  // to read them in cleartext without going through that control.
  if (fieldType === "ssn" || fieldType === "ein") {
    const digits = String(raw).replace(/\D/g, "");
    return digits.length >= 4 ? `****${digits.slice(-4)}` : "on file";
  }
  if (fieldType === "signature" && typeof raw === "object") {
    const sig = raw as { typed_name?: string; signature_image_path?: string; signed_at?: string };
    const signedOn = sig.signed_at ? ` on ${new Date(sig.signed_at).toLocaleDateString()}` : "";
    if (sig.typed_name) return `Signed by ${sig.typed_name}${signedOn}`;
    return sig.signature_image_path ? `Signed (drawn signature)${signedOn}` : "Signed";
  }
  if (fieldType === "name") return formatNameValue(raw);
  if (fieldType === "address") return formatAddressValue(raw);
  if (typeof raw === "object") return JSON.stringify(raw);
  return String(raw);
}

async function buildOrganizerPdf(
  templateName: string,
  submittedLabel: string,
  rows: { label: string; value: string }[]
): Promise<Uint8Array> {
  const pdf = await TextPdf.create();
  pdf.heading(templateName);
  pdf.subtle(`Submitted ${submittedLabel}`);
  for (const row of rows) {
    pdf.labelValueRow(row.label, row.value);
  }
  return pdf.save();
}

// Called right after an organizer response is actually completed (public
// intake link or the client-portal self-fill flow) so the answers show up
// as a document in the client's Documents instead of only living in
// organizer_response_answers. Answers are re-fetched server-side by
// response id, same trust model as file-signed-engagement-letter.
export async function POST(request: Request) {
  const allowed = await checkRateLimit(`file-organizer-response:${clientIp(request)}`, 20, 60);
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests. Try again shortly." }, { status: 429 });
  }

  const { responseId } = await request.json().catch(() => ({ responseId: null }));
  if (typeof responseId !== "string") {
    return NextResponse.json({ error: "responseId is required" }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { data: response } = await supabase
    .from("organizer_responses")
    .select("id, workspace_id, client_id, status, submitted_at, filed_as_attachment, organizer_templates(name)")
    .eq("id", responseId)
    .maybeSingle();

  if (!response) {
    return NextResponse.json({ error: "Organizer response not found" }, { status: 404 });
  }
  if (response.status !== "submitted" && response.status !== "reviewed") {
    return NextResponse.json({ error: "This organizer has not been submitted yet" }, { status: 400 });
  }
  if (response.filed_as_attachment) {
    return NextResponse.json({ ok: true, alreadyFiled: true });
  }

  const { data: answers } = await supabase
    .from("organizer_response_answers")
    .select("value, instance_index, organizer_fields(label, field_type, display_order)")
    .eq("organizer_response_id", responseId);

  const rows = (answers ?? [])
    .map((a) => {
      const field = a.organizer_fields as unknown as { label: string; field_type: string; display_order: number } | null;
      if (!field) return null;
      return { order: field.display_order, instance: a.instance_index, label: field.label, value: displayValue(field.field_type, a.value) };
    })
    .filter((r): r is { order: number; instance: number; label: string; value: string } => r !== null)
    .sort((a, b) => a.order - b.order || a.instance - b.instance);

  const templateName = (response.organizer_templates as unknown as { name?: string } | null)?.name ?? "Organizer";
  const submittedLabel = response.submitted_at ? new Date(response.submitted_at).toLocaleDateString() : "";
  const pdfBytes = await buildOrganizerPdf(templateName, submittedLabel, rows);

  const fileName = `${templateName} (completed).pdf`;
  const path = `${response.workspace_id}/${response.client_id}/${Date.now()}-${fileName}`;
  const blob = new Blob([Buffer.from(pdfBytes)], { type: "application/pdf" });

  const { error: uploadErr } = await supabase.storage.from("client-documents").upload(path, blob, { contentType: "application/pdf" });
  if (uploadErr) {
    return NextResponse.json({ error: uploadErr.message }, { status: 500 });
  }

  const folderId = await resolveClientServiceFolder(supabase, response.workspace_id, response.client_id);

  // client_visible: the client filled this organizer in themselves, so they
  // should be able to see and download their own submitted answers, same as
  // any other document shared with them.
  const { error: insertErr } = await supabase.from("attachments").insert({
    workspace_id: response.workspace_id,
    entity_type: "client",
    entity_id: response.client_id,
    folder_id: folderId,
    file_name: fileName,
    storage_path: path,
    mime_type: "application/pdf",
    file_size_bytes: blob.size,
    visibility: "client_visible",
    category: "Other",
  });
  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  await supabase.from("organizer_responses").update({ filed_as_attachment: true }).eq("id", responseId);

  return NextResponse.json({ ok: true });
}
