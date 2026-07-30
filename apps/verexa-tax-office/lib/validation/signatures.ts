import { z } from "zod";
import type { Enums } from "@/types/database";

type SignatureRequestStatus = Enums<"signature_request_status">;
type SignerStatus = Enums<"signer_status">;

export const SIGNATURE_REQUEST_STATUS_LABELS: Record<SignatureRequestStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  viewed: "Viewed",
  partially_signed: "Partially signed",
  completed: "Completed",
  declined: "Declined",
  expired: "Expired",
  cancelled: "Cancelled",
};

export const SIGNER_STATUS_LABELS: Record<SignerStatus, string> = {
  pending: "Pending",
  sent: "Sent",
  viewed: "Viewed",
  signed: "Signed",
  declined: "Declined",
  expired: "Expired",
};

export function signatureRequestStatusLabel(v: string | null | undefined): string {
  if (!v) return "—";
  return (SIGNATURE_REQUEST_STATUS_LABELS as Record<string, string>)[v] ?? v.replace(/_/g, " ");
}
export function signerStatusLabel(v: string | null | undefined): string {
  if (!v) return "—";
  return (SIGNER_STATUS_LABELS as Record<string, string>)[v] ?? v.replace(/_/g, " ");
}

export const signerSchema = z.object({
  name: z.string().trim().min(1, "Enter a name."),
  email: z.string().trim().email("Enter a valid email."),
  role: z.string().max(100).optional().nullable(),
  clientContactId: z.string().uuid().optional().nullable(),
});
export type SignerInput = z.infer<typeof signerSchema>;

export const newSignatureRequestSchema = z.object({
  clientId: z.string().uuid("Choose a client."),
  engagementId: z.string().uuid().optional().nullable(),
  documentId: z.string().uuid().optional().nullable(),
  title: z.string().trim().min(1, "Enter a title."),
  message: z.string().max(2000).optional().nullable(),
  signingOrderRequired: z.boolean().default(false),
  expiresInDays: z.coerce.number().int().min(1).max(90).default(14),
  signers: z.array(signerSchema).min(1, "Add at least one signer."),
});
export type NewSignatureRequestInput = z.infer<typeof newSignatureRequestSchema>;
