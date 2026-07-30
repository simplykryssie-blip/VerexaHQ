import { z } from "zod";
import type { Enums } from "@/types/database";

type DocumentRequestStatus = Enums<"document_request_status">;
type DocumentRequestItemStatus = Enums<"document_request_item_status">;

// Verbatim from generated database enums — never invent values here.
export const DOCUMENT_REQUEST_STATUS_LABELS: Record<DocumentRequestStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  viewed: "Viewed",
  in_progress: "In progress",
  partially_complete: "Partially complete",
  completed: "Completed",
  cancelled: "Cancelled",
  expired: "Expired",
};

export const DOCUMENT_REQUEST_ITEM_STATUS_LABELS: Record<DocumentRequestItemStatus, string> = {
  requested: "Requested",
  uploaded: "Uploaded",
  under_review: "Under review",
  accepted: "Accepted",
  rejected: "Rejected",
  waived: "Waived",
  not_applicable: "Not applicable",
};

export function requestStatusLabel(status: string | null | undefined): string {
  if (!status) return "—";
  return (DOCUMENT_REQUEST_STATUS_LABELS as Record<string, string>)[status] ?? status.replace(/_/g, " ");
}

export function requestItemStatusLabel(status: string | null | undefined): string {
  if (!status) return "—";
  return (DOCUMENT_REQUEST_ITEM_STATUS_LABELS as Record<string, string>)[status] ?? status.replace(/_/g, " ");
}

export const requestItemSchema = z.object({
  categoryId: z.string().uuid().optional().nullable(),
  documentLabel: z.string().trim().min(1, "Enter a label for this item."),
  customLabel: z.string().max(200).optional().nullable(),
  description: z.string().max(1000).optional().nullable(),
  isRequired: z.boolean().default(true),
  minimumFiles: z.coerce.number().int().min(1).default(1),
  maximumFiles: z.coerce.number().int().min(1).optional().nullable(),
  taxYear: z.coerce.number().int().min(1990).max(2100).optional().nullable(),
});
export type RequestItemInput = z.infer<typeof requestItemSchema>;

export const newDocumentRequestSchema = z.object({
  clientId: z.string().uuid("Choose a client."),
  engagementId: z.string().uuid().optional().nullable(),
  templateId: z.string().uuid().optional().nullable(),
  title: z.string().trim().min(1, "Enter a title."),
  clientMessage: z.string().max(2000).optional().nullable(),
  internalNotes: z.string().max(2000).optional().nullable(),
  dueDate: z.string().optional().nullable(),
  assignedToUserId: z.string().uuid().optional().nullable(),
  items: z.array(requestItemSchema).min(1, "Add at least one requested item."),
});
export type NewDocumentRequestInput = z.infer<typeof newDocumentRequestSchema>;

export const waiveItemSchema = z.object({
  reason: z.string().trim().min(1, "A waiver reason is required.").max(1000),
});
export type WaiveItemInput = z.infer<typeof waiveItemSchema>;
