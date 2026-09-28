import type { SupabaseClient } from "@supabase/supabase-js";
import { renderIrsAuthorizationPdf } from "@/lib/documents/renderIrsAuthorizationPdf";
import type { IrsTaxMatterRow } from "@/lib/irsAuthorization/types";

// Fills the workspace's uploaded IRS Form 8821 PDF template for one
// authorization and queues it for signature -- the same
// upload/attachment/signature_requests wiring as
// createSignatureRequestFromTemplate, just with tax-matter-table merge
// values computed from the authorization's own data instead of coming
// from a generic mergeValues caller. Only ever called once per
// authorization while it's still in 'draft' -- the caller is responsible
// for that check (and for then flipping the authorization's own status).
export async function generateIrsAuthorizationDocument({
  supabase,
  workspaceId,
  clientId,
  clientName,
  clientEmail,
  clientAddress,
  firmName,
  firmAddress,
  firmPhone,
  templateId,
  designeeName,
  designeeCafNumber,
  taxMatters,
}: {
  supabase: SupabaseClient;
  workspaceId: string;
  clientId: string;
  clientName: string;
  clientEmail: string | null;
  clientAddress: string;
  firmName: string;
  firmAddress: string;
  firmPhone: string;
  templateId: string;
  designeeName: string;
  designeeCafNumber: string | null;
  taxMatters: IrsTaxMatterRow[];
}): Promise<{ attachmentId: string; signatureRequestId: string } | { error: string }> {
  const rendered = await renderIrsAuthorizationPdf({
    supabase,
    templateId,
    clientName,
    clientAddress,
    firmName,
    firmAddress,
    firmPhone,
    designeeName,
    designeeCafNumber,
    taxMatters,
  });
  if ("error" in rendered) return rendered;
  const { pdfBytes } = rendered;

  const fileName = `IRS Form 8821 -- ${clientName}.pdf`;
  const path = `${workspaceId}/${clientId}/${Date.now()}-${fileName}`;
  const blob = new Blob([pdfBytes as unknown as BlobPart], { type: "application/pdf" });
  const { error: uploadErr } = await supabase.storage.from("client-documents").upload(path, blob, { contentType: "application/pdf" });
  if (uploadErr) return { error: uploadErr.message };

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: attachment, error: insertErr } = await supabase
    .from("attachments")
    .insert({
      workspace_id: workspaceId,
      entity_type: "client",
      entity_id: clientId,
      file_name: fileName,
      storage_path: path,
      mime_type: "application/pdf",
      file_size_bytes: blob.size,
      uploaded_by: user?.id,
      visibility: "internal",
      category: "IRS Form 8821",
    })
    .select("id")
    .single();
  if (insertErr || !attachment) return { error: insertErr?.message ?? "Could not save the generated 8821." };

  const { data: request, error: reqError } = await supabase
    .from("signature_requests")
    .insert({
      workspace_id: workspaceId,
      attachment_id: attachment.id,
      engagement_letter_template_id: templateId,
      title: fileName,
    })
    .select("id")
    .single();
  if (reqError || !request) return { error: reqError?.message ?? "Could not create the signature request." };

  const { error: signerErr } = await supabase
    .from("signature_request_signers")
    .insert({ signature_request_id: request.id, signer_name: clientName, signer_email: clientEmail, sign_order: 1 });
  if (signerErr) return { error: signerErr.message };

  return { attachmentId: attachment.id, signatureRequestId: request.id };
}
