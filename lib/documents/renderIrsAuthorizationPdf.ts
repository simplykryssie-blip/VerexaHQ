import type { SupabaseClient } from "@supabase/supabase-js";
import { renderPdfTemplate, type PdfFieldMapping } from "@/lib/documents/renderPdfTemplate";
import type { IrsTaxMatterRow } from "@/lib/irsAuthorization/types";

// Shared by the "Preview" button (renders in-memory only, nothing written)
// and generateIrsAuthorizationDocument.ts (renders, then uploads/attaches) --
// keeps the merge-field construction in one place so a preview can never
// drift from what actually gets generated and sent.
export async function renderIrsAuthorizationPdf({
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
}: {
  supabase: SupabaseClient;
  templateId: string;
  clientName: string;
  clientAddress: string;
  firmName: string;
  firmAddress: string;
  firmPhone: string;
  designeeName: string;
  designeeCafNumber: string | null;
  taxMatters: IrsTaxMatterRow[];
}): Promise<{ pdfBytes: Uint8Array } | { error: string }> {
  const { data: template, error: templateErr } = await supabase
    .from("engagement_letter_templates")
    .select("id, pdf_storage_path, pdf_field_mode, pdf_field_mappings")
    .eq("id", templateId)
    .single();
  if (templateErr || !template || !template.pdf_storage_path || !template.pdf_field_mode) {
    return { error: "Could not load the IRS Form 8821 PDF template -- upload and map it under Form Templates first." };
  }

  const { data: sourceFile, error: downloadErr } = await supabase.storage
    .from("document-templates")
    .download(template.pdf_storage_path);
  if (downloadErr || !sourceFile) return { error: downloadErr?.message ?? "Could not load the uploaded 8821 PDF." };

  const mergeValues: Record<string, string> = {
    client_name: clientName,
    client_address: clientAddress,
    firm_name: firmName,
    firm_address: firmAddress,
    firm_phone: firmPhone,
    current_date: new Date().toLocaleDateString(),
    designee_name: designeeName,
    designee_caf_number: designeeCafNumber ?? "",
  };
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

  return { pdfBytes };
}
