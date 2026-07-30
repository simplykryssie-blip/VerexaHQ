import { z } from "zod";
import type { Enums } from "@/types/database";

type DocumentStatus = Enums<"document_status">;
type DocumentVisibility = Enums<"document_visibility">;
type DocumentSource = Enums<"document_source">;

// Verbatim from generated database enums — never invent values here.
export const DOCUMENT_STATUS_LABELS: Record<DocumentStatus, string> = {
  uploaded: "Uploaded",
  processing: "Processing",
  available: "Available",
  needs_review: "Needs review",
  approved: "Approved",
  rejected: "Rejected",
  replaced: "Replaced",
  archived: "Archived",
  deleted: "Deleted",
};

export const DOCUMENT_VISIBILITY_LABELS: Record<DocumentVisibility, string> = {
  client_and_staff: "Client & staff",
  staff_only: "Staff only",
  client_only: "Client only",
  shared_office: "Shared office",
  restricted: "Restricted",
};

export const DOCUMENT_SOURCE_LABELS: Record<DocumentSource, string> = {
  client_upload: "Client upload",
  staff_upload: "Staff upload",
  email_import: "Email import",
  form_upload: "Form upload",
  workflow: "Workflow",
  integration: "Integration",
  generated: "Generated",
};

export const DOCUMENT_VISIBILITY_VALUES = Object.keys(DOCUMENT_VISIBILITY_LABELS) as [DocumentVisibility, ...DocumentVisibility[]];

export function documentStatusLabel(status: string | null | undefined): string {
  if (!status) return "—";
  return (DOCUMENT_STATUS_LABELS as Record<string, string>)[status] ?? status.replace(/_/g, " ");
}

export function documentVisibilityLabel(visibility: string | null | undefined): string {
  if (!visibility) return "—";
  return (DOCUMENT_VISIBILITY_LABELS as Record<string, string>)[visibility] ?? visibility.replace(/_/g, " ");
}

// tax-client-documents bucket's configured allowed MIME types (see storage.buckets) — kept in
// sync manually since Supabase Storage config isn't exposed through generated types.
export const ALLOWED_DOCUMENT_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/heif",
  "text/csv",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

export const MAX_DOCUMENT_SIZE_BYTES = 50 * 1024 * 1024;

export const uploadDocumentSchema = z.object({
  categoryId: z.string().uuid().optional().nullable(),
  customLabel: z.string().max(200).optional().nullable(),
  taxYear: z.coerce.number().int().min(1990).max(2100).optional().nullable(),
  visibility: z.enum(DOCUMENT_VISIBILITY_VALUES).default("client_and_staff"),
  engagementId: z.string().uuid().optional().nullable(),
  householdMemberId: z.string().uuid().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});
export type UploadDocumentInput = z.infer<typeof uploadDocumentSchema>;

export const documentReviewSchema = z.object({
  action: z.enum(["approve", "reject", "request_replacement"]),
  notes: z.string().max(2000).optional().nullable(),
});
export type DocumentReviewInput = z.infer<typeof documentReviewSchema>;
