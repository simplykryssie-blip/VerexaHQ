import { TextPdf } from "@/lib/pdf/textPdf";
import { htmlToParagraphs } from "@/lib/documents/renderLetterPdf";

// Renders the combined Terms-of-Service + Privacy-Policy acceptance record
// as a single PDF, built entirely from already-captured snapshot HTML (never
// from the live /terms or /privacy pages) so a retry can regenerate an
// identical document from the same stored content.
export async function renderLegalAcceptancePdf({
  archiveId,
  version,
  effectiveDateLabel,
  workspaceName,
  acceptedByName,
  acceptedByEmail,
  acceptedAtLabel,
  termsHtml,
  privacyHtml,
}: {
  archiveId: string;
  version: string;
  effectiveDateLabel: string;
  workspaceName: string;
  acceptedByName: string;
  acceptedByEmail: string;
  acceptedAtLabel: string;
  termsHtml: string;
  privacyHtml: string;
}): Promise<Uint8Array> {
  const pdf = await TextPdf.create();

  pdf.heading("Verexa HQ -- Platform Terms of Service & Privacy Policy", 16);
  pdf.paragraph(
    "This document is an immutable snapshot of the Verexa Platform Terms of Service and Privacy Policy exactly as presented at the time of acceptance below. It will not change if Verexa's Terms or Privacy Policy are later updated.",
    10
  );
  pdf.spacer(6);
  pdf.labelValueRow("Version / effective date", `${version} (${effectiveDateLabel})`);
  pdf.labelValueRow("Workspace", workspaceName);
  pdf.labelValueRow("Accepted by", `${acceptedByName} <${acceptedByEmail}>`);
  pdf.labelValueRow("Accepted at", acceptedAtLabel);
  pdf.labelValueRow("Archive record ID", archiveId);

  pdf.newPage();
  pdf.heading("Terms of Service", 16);
  for (const paragraph of htmlToParagraphs(termsHtml)) {
    pdf.paragraph(paragraph);
  }

  pdf.newPage();
  pdf.heading("Privacy Policy", 16);
  for (const paragraph of htmlToParagraphs(privacyHtml)) {
    pdf.paragraph(paragraph);
  }

  return pdf.save();
}
