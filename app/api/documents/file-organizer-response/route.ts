import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { checkRateLimit, clientIp } from "@/lib/rateLimit";

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function displayValue(fieldType: string, raw: unknown): string {
  if (raw === null || raw === undefined || raw === "") return "--";
  // ssn/ein are permission-gated + audit-logged via reveal_organizer_answer()
  // everywhere else in the app -- the filed summary must not become a way
  // to read them in cleartext without going through that control.
  if (fieldType === "ssn" || fieldType === "ein") {
    const digits = String(raw).replace(/\D/g, "");
    return digits.length >= 4 ? `••••${digits.slice(-4)}` : "on file";
  }
  if (fieldType === "signature" && typeof raw === "object") {
    const sig = raw as { typed_name?: string; signed_at?: string };
    return sig.typed_name ? `Signed by ${sig.typed_name}${sig.signed_at ? ` on ${new Date(sig.signed_at).toLocaleDateString()}` : ""}` : "Signed";
  }
  if (typeof raw === "object") return JSON.stringify(raw);
  return String(raw);
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
    .select("id, workspace_id, client_id, status, submitted_at, filed_as_attachment, signature_request_id, organizer_templates(name)")
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

  const templateName = (response.organizer_templates as unknown as { name?: string } | null)?.name ?? "Organizer";

  // A combined template that was actually signed already has the exact
  // resolved document (rich-text terms merged with the client's own
  // answers, in order) captured at signing time -- file that verbatim
  // instead of rebuilding a plain Q&A table from the raw answers, so what's
  // in Documents matches what was legally agreed to.
  let html: string;
  let fileName: string;
  let visibility: "internal" | "client_visible";
  let category: string;

  if (response.signature_request_id) {
    const { data: signer } = await supabase
      .from("signature_request_signers")
      .select("resolved_document_html")
      .eq("signature_request_id", response.signature_request_id)
      .maybeSingle();

    if (!signer?.resolved_document_html) {
      return NextResponse.json({ error: "Signed document not found" }, { status: 404 });
    }

    html = `<!doctype html>
<html><head><meta charset="utf-8"><title>${escapeHtml(templateName)}</title></head>
<body style="font-family: -apple-system, sans-serif; max-width: 640px; margin: 2rem auto;">
${signer.resolved_document_html}
</body></html>`;
    fileName = `${templateName} (signed).html`;
    visibility = "client_visible";
    category = "Engagement Letter";
  } else {
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

    const submittedLabel = response.submitted_at ? new Date(response.submitted_at).toLocaleDateString() : "";
    html = `<!doctype html>
<html><head><meta charset="utf-8"><title>${escapeHtml(templateName)}</title></head>
<body style="font-family: -apple-system, sans-serif; max-width: 640px; margin: 2rem auto;">
<h1>${escapeHtml(templateName)}</h1>
<p style="color:#666;">Submitted ${escapeHtml(submittedLabel)}</p>
<table style="width:100%; border-collapse: collapse;">
${rows
  .map(
    (r) =>
      `<tr><td style="padding:6px 8px; border-bottom:1px solid #eee; font-weight:600;">${escapeHtml(r.label)}</td><td style="padding:6px 8px; border-bottom:1px solid #eee;">${escapeHtml(r.value)}</td></tr>`
  )
  .join("\n")}
</table>
</body></html>`;
    fileName = `${templateName} (completed).html`;
    visibility = "internal";
    category = "Other";
  }

  const path = `${response.workspace_id}/${response.client_id}/${Date.now()}-${fileName}`;
  const blob = new Blob([html], { type: "text/html" });

  const { error: uploadErr } = await supabase.storage.from("client-documents").upload(path, blob, { contentType: "text/html" });
  if (uploadErr) {
    return NextResponse.json({ error: uploadErr.message }, { status: 500 });
  }

  const { error: insertErr } = await supabase.from("attachments").insert({
    workspace_id: response.workspace_id,
    entity_type: "client",
    entity_id: response.client_id,
    file_name: fileName,
    storage_path: path,
    mime_type: "text/html",
    file_size_bytes: blob.size,
    visibility,
    category,
  });
  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  await supabase.from("organizer_responses").update({ filed_as_attachment: true }).eq("id", responseId);

  return NextResponse.json({ ok: true });
}
