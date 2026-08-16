import type { SupabaseClient } from "@supabase/supabase-js";
import { renderTemplate } from "@/lib/templates/render";
import { renderLetterPdf } from "@/lib/documents/renderLetterPdf";

export async function createSignatureRequestFromTemplate({
  supabase,
  workspaceId,
  entityType,
  entityId,
  template,
  clientName,
  firmName,
  signers,
  title,
  dueDate,
}: {
  supabase: SupabaseClient;
  workspaceId: string;
  entityType: string;
  entityId: string;
  template: { id: string; name: string; body_html: string };
  clientName?: string;
  firmName?: string;
  signers: { signer_name: string; signer_email: string | null }[];
  title: string;
  dueDate?: string | null;
}): Promise<{ requestId: string } | { error: string }> {
  const mergedHtml = renderTemplate(template.body_html, {
    client_name: clientName ?? "",
    firm_name: firmName ?? "",
    firm_address: "",
    firm_phone: "",
  });
  // A rendered PDF (not the raw HTML) so the signing page can actually
  // preview it -- it only knows how to render PDFs and images -- and so it
  // has a real, visible signature line rather than a bare "type your name"
  // box with no document underneath it.
  const signerLabel = signers[0]?.signer_name || clientName || "Client";
  const pdfBytes = await renderLetterPdf(template.name, mergedHtml, signerLabel);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const fileName = `${template.name}.pdf`;
  const path = `${workspaceId}/${entityId}/${Date.now()}-${fileName}`;
  const blob = new Blob([pdfBytes as unknown as BlobPart], { type: "application/pdf" });
  const { error: uploadErr } = await supabase.storage.from("client-documents").upload(path, blob, { contentType: "application/pdf" });
  if (uploadErr) return { error: uploadErr.message };

  const { data: attachment, error: insertErr } = await supabase
    .from("attachments")
    .insert({
      workspace_id: workspaceId,
      entity_type: entityType,
      entity_id: entityId,
      file_name: fileName,
      storage_path: path,
      mime_type: "application/pdf",
      file_size_bytes: blob.size,
      uploaded_by: user?.id,
      visibility: "internal",
      category: "Engagement Letter",
    })
    .select("id")
    .single();
  if (insertErr || !attachment) return { error: insertErr?.message ?? "Could not prepare the template for signing." };

  const { data: request, error: reqError } = await supabase
    .from("signature_requests")
    .insert({
      workspace_id: workspaceId,
      attachment_id: attachment.id,
      engagement_letter_template_id: template.id,
      title,
      due_date: dueDate || null,
    })
    .select("id")
    .single();
  if (reqError || !request) return { error: reqError?.message ?? "Could not create signature request." };

  if (signers.length > 0) {
    const { error: signersError } = await supabase.from("signature_request_signers").insert(
      signers.map((s, i) => ({ signature_request_id: request.id, signer_name: s.signer_name, signer_email: s.signer_email, sign_order: i + 1 }))
    );
    if (signersError) return { error: signersError.message };
  }

  return { requestId: request.id };
}
