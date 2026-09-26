import type { SupabaseClient } from "@supabase/supabase-js";
import { renderPdfTemplate, type PdfFieldMapping } from "@/lib/documents/renderPdfTemplate";
import type { IrsTaxMatterRow, IrsDesignee } from "@/lib/irsAuthorization/types";

// Taxpayer TIN is never stored on irs_authorizations -- clients.ssn_encrypted/
// itin_encrypted/ein_encrypted stays the sole source of truth, revealed
// transiently here (audit-logged by the reveal RPC itself) and used only to
// build this one in-memory merge-value set. Checked in the same
// individual-vs-business priority order clients would actually have exactly
// one of these on file.
async function revealClientTin(supabase: SupabaseClient, clientId: string): Promise<string> {
  const { data: client } = await supabase.from("clients").select("ssn_last4, itin_last4, ein_last4").eq("id", clientId).single();
  if (!client) return "";
  if (client.ssn_last4) {
    const { data } = await supabase.rpc("reveal_client_ssn", { p_client_id: clientId });
    if (data) return data as string;
  }
  if (client.itin_last4) {
    const { data } = await supabase.rpc("reveal_client_itin", { p_client_id: clientId });
    if (data) return data as string;
  }
  if (client.ein_last4) {
    const { data } = await supabase.rpc("reveal_client_ein", { p_client_id: clientId });
    if (data) return data as string;
  }
  return "";
}

// Same reasoning as revealClientTin: PTIN is encrypted at rest on
// user_profiles and is only ever pulled in here transiently for this one
// document, never persisted onto irs_authorizations.designees.
async function revealDesigneePtin(supabase: SupabaseClient, workspaceId: string, userId: string | null): Promise<string> {
  if (!userId) return "";
  const { data } = await supabase.rpc("reveal_designee_ptin", { p_workspace_id: workspaceId, p_user_id: userId });
  return (data as string | null) ?? "";
}

const CHECKBOX_TRUE = "true";
const CHECKBOX_FALSE = "";

// Fills the workspace's uploaded IRS Form 8821 PDF template for one
// authorization and queues it for signature -- the same
// upload/attachment/signature_requests wiring as
// createSignatureRequestFromTemplate, just with 8821-specific merge values
// (including a transient TIN/PTIN reveal) computed from the authorization's
// own data instead of coming from a generic mergeValues caller. Only ever
// called once per authorization while it's still in 'draft' -- the caller is
// responsible for that check (and for then flipping the authorization's own
// status).
export async function generateIrsAuthorizationDocument({
  supabase,
  workspaceId,
  clientId,
  clientName,
  clientEmail,
  clientAddress,
  clientPhone,
  firmName,
  firmAddress,
  firmPhone,
  templateId,
  designees,
  taxMatters,
  planNumber,
  specificUseNotOnCaf,
  retainPriorAuthorizations,
  intermediateServiceProvider,
  additionalDesigneesAttached,
}: {
  supabase: SupabaseClient;
  workspaceId: string;
  clientId: string;
  clientName: string;
  clientEmail: string | null;
  clientAddress: string;
  clientPhone: string;
  firmName: string;
  firmAddress: string;
  firmPhone: string;
  templateId: string;
  designees: IrsDesignee[];
  taxMatters: IrsTaxMatterRow[];
  planNumber: string | null;
  specificUseNotOnCaf: boolean;
  retainPriorAuthorizations: boolean;
  intermediateServiceProvider: boolean;
  additionalDesigneesAttached: boolean;
}): Promise<{ attachmentId: string; signatureRequestId: string } | { error: string }> {
  const { data: template, error: templateErr } = await supabase
    .from("engagement_letter_templates")
    .select("id, name, pdf_storage_path, pdf_field_mode, pdf_field_mappings")
    .eq("id", templateId)
    .single();
  if (templateErr || !template || !template.pdf_storage_path || !template.pdf_field_mode) {
    return { error: "Could not load the IRS Form 8821 PDF template -- upload and map it under Form Templates first." };
  }

  const { data: sourceFile, error: downloadErr } = await supabase.storage
    .from("document-templates")
    .download(template.pdf_storage_path);
  if (downloadErr || !sourceFile) return { error: downloadErr?.message ?? "Could not load the uploaded 8821 PDF." };

  const clientTin = await revealClientTin(supabase, clientId);

  const mergeValues: Record<string, string> = {
    client_name: clientName,
    client_address: clientAddress,
    client_tin: clientTin,
    client_phone: clientPhone,
    plan_number: planNumber ?? "",
    firm_name: firmName,
    firm_address: firmAddress,
    firm_phone: firmPhone,
    current_date: new Date().toLocaleDateString(),
    specific_use_not_on_caf: specificUseNotOnCaf ? CHECKBOX_TRUE : CHECKBOX_FALSE,
    retain_prior_authorizations: retainPriorAuthorizations ? CHECKBOX_TRUE : CHECKBOX_FALSE,
    intermediate_service_provider: intermediateServiceProvider ? CHECKBOX_TRUE : CHECKBOX_FALSE,
    additional_designees_attached: additionalDesigneesAttached ? CHECKBOX_TRUE : CHECKBOX_FALSE,
  };

  for (let i = 0; i < designees.length; i++) {
    const d = designees[i];
    const n = i + 1;
    const ptin = await revealDesigneePtin(supabase, workspaceId, d.user_id);
    mergeValues[`designee_${n}_name`] = d.name;
    mergeValues[`designee_${n}_address`] = d.address;
    mergeValues[`designee_${n}_caf_number`] = d.caf_number ?? "";
    mergeValues[`designee_${n}_ptin`] = ptin;
    mergeValues[`designee_${n}_phone`] = d.phone;
    mergeValues[`designee_${n}_fax`] = d.fax;
    mergeValues[`designee_${n}_new_address`] = d.new_address ? CHECKBOX_TRUE : CHECKBOX_FALSE;
    mergeValues[`designee_${n}_new_telephone`] = d.new_telephone ? CHECKBOX_TRUE : CHECKBOX_FALSE;
    mergeValues[`designee_${n}_new_fax`] = d.new_fax ? CHECKBOX_TRUE : CHECKBOX_FALSE;
    mergeValues[`designee_${n}_receives_notices`] = d.receives_notices ? CHECKBOX_TRUE : CHECKBOX_FALSE;
  }
  // Back-compat aliases for the original single-designee tokens, in case an
  // already-mapped template still references them for designee 1.
  if (designees[0]) {
    mergeValues.designee_name = designees[0].name;
    mergeValues.designee_caf_number = designees[0].caf_number ?? "";
  }

  taxMatters.forEach((row, i) => {
    const n = i + 1;
    mergeValues[`tax_matter_${n}_type`] = row.tax_info_type;
    mergeValues[`tax_matter_${n}_form`] = row.tax_form_number;
    mergeValues[`tax_matter_${n}_years`] = row.years_or_periods;
    mergeValues[`tax_matter_${n}_matters`] = row.specific_matters;
  });

  const pdfBytes = await renderPdfTemplate({
    sourceBytes: new Uint8Array(await sourceFile.arrayBuffer()),
    fieldMode: template.pdf_field_mode as "acroform" | "overlay",
    fieldMappings: (template.pdf_field_mappings as PdfFieldMapping[] | null) ?? [],
    values: mergeValues,
  });

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
      engagement_letter_template_id: template.id,
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
