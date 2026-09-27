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

export type IrsAuthorizationDocumentInput = {
  supabase: SupabaseClient;
  workspaceId: string;
  clientId: string;
  clientName: string;
  clientAddress: string;
  clientPhone: string;
  firmName: string;
  firmAddress: string;
  firmPhone: string;
  designees: IrsDesignee[];
  taxMatters: IrsTaxMatterRow[];
  planNumber: string | null;
  specificUseNotOnCaf: boolean;
  retainPriorAuthorizations: boolean;
  intermediateServiceProvider: boolean;
  additionalDesigneesAttached: boolean;
};

// The single source of truth for what every 8821 merge token resolves to --
// shared by both the real generation path below and previewIrsAuthorizationDocument,
// so a preview can never drift from what actually gets sent. Includes the
// transient TIN/PTIN reveals; the returned object is meant to be used once
// and discarded, never persisted.
export async function buildIrsAuthorizationMergeValues(input: IrsAuthorizationDocumentInput): Promise<Record<string, string>> {
  const { supabase, workspaceId, clientId, clientName, clientAddress, clientPhone, firmName, firmAddress, firmPhone, designees, taxMatters } = input;

  const clientTin = await revealClientTin(supabase, clientId);

  const mergeValues: Record<string, string> = {
    client_name: clientName,
    client_address: clientAddress,
    client_tin: clientTin,
    client_phone: clientPhone,
    plan_number: input.planNumber ?? "",
    firm_name: firmName,
    firm_address: firmAddress,
    firm_phone: firmPhone,
    current_date: new Date().toLocaleDateString(),
    specific_use_not_on_caf: input.specificUseNotOnCaf ? CHECKBOX_TRUE : CHECKBOX_FALSE,
    retain_prior_authorizations: input.retainPriorAuthorizations ? CHECKBOX_TRUE : CHECKBOX_FALSE,
    intermediate_service_provider: input.intermediateServiceProvider ? CHECKBOX_TRUE : CHECKBOX_FALSE,
    additional_designees_attached: input.additionalDesigneesAttached ? CHECKBOX_TRUE : CHECKBOX_FALSE,
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

  return mergeValues;
}

async function loadTemplateAndRender(
  input: IrsAuthorizationDocumentInput & { templateId: string }
): Promise<{ pdfBytes: Uint8Array; fileName: string } | { error: string }> {
  const { supabase, templateId, clientName } = input;
  const { data: template, error: templateErr } = await supabase
    .from("engagement_letter_templates")
    .select("id, name, pdf_storage_path, pdf_field_mode, pdf_field_mappings")
    .eq("id", templateId)
    .single();
  if (templateErr || !template || !template.pdf_storage_path || !template.pdf_field_mode) {
    return { error: "Could not load the IRS Form 8821 PDF template -- upload and map it under Form Templates first." };
  }

  const { data: sourceFile, error: downloadErr } = await supabase.storage.from("document-templates").download(template.pdf_storage_path);
  if (downloadErr || !sourceFile) return { error: downloadErr?.message ?? "Could not load the uploaded 8821 PDF." };

  const mergeValues = await buildIrsAuthorizationMergeValues(input);

  const pdfBytes = await renderPdfTemplate({
    sourceBytes: new Uint8Array(await sourceFile.arrayBuffer()),
    fieldMode: template.pdf_field_mode as "acroform" | "overlay",
    fieldMappings: (template.pdf_field_mappings as PdfFieldMapping[] | null) ?? [],
    values: mergeValues,
  });

  return { pdfBytes, fileName: `IRS Form 8821 -- ${clientName}.pdf` };
}

// Renders the exact same document generateIrsAuthorizationDocument would
// produce, but persists nothing -- no upload, no attachment, no signature
// request. For the "Preview 8821" action: a preparer can see precisely what
// will be sent, including the transient TIN/PTIN reveal actually landing in
// the right boxes, before anything is created. Uses the same
// loadTemplateAndRender/renderPdfTemplate path as the real send, so a
// preview can never show something different from what actually goes out.
export async function previewIrsAuthorizationDocument(
  input: IrsAuthorizationDocumentInput & { templateId: string }
): Promise<{ pdfBytes: Uint8Array; fileName: string } | { error: string }> {
  return loadTemplateAndRender(input);
}

// Fills the workspace's uploaded IRS Form 8821 PDF template for one
// authorization and queues it for signature -- the same
// upload/attachment/signature_requests wiring as
// createSignatureRequestFromTemplate, just with 8821-specific merge values
// (including a transient TIN/PTIN reveal) computed from the authorization's
// own data instead of coming from a generic mergeValues caller. Only ever
// called once per authorization while it's still in 'draft' -- the caller is
// responsible for that check (and for then flipping the authorization's own
// status).
export async function generateIrsAuthorizationDocument(
  input: IrsAuthorizationDocumentInput & { templateId: string; clientEmail: string | null }
): Promise<{ attachmentId: string; signatureRequestId: string } | { error: string }> {
  const { supabase, workspaceId, clientId, clientName, clientEmail, templateId } = input;

  const rendered = await loadTemplateAndRender(input);
  if ("error" in rendered) return rendered;
  const { pdfBytes, fileName } = rendered;

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
      // client_visible (not the "internal" every other signature-request
      // document uses) so this shows up in the client's own portal
      // Documents list automatically -- the whole point of this document is
      // for the client to act on it, unlike an internal staff file. The
      // copy-signing-link button on the detail page still works exactly the
      // same as before; this just adds a second way for the client to find
      // and sign it without needing that link sent to them separately.
      visibility: "client_visible",
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
