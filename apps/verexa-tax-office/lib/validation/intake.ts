import { z } from "zod";

// Verbatim from generated database enums — never invent values here.
export const INTAKE_STATUS_LABELS: Record<string, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  submitted: "Submitted",
  changes_requested: "Changes requested",
  resubmitted: "Resubmitted",
  under_review: "Under review",
  approved: "Approved",
  rejected: "Rejected",
  archived: "Archived",
};

export const REVIEW_RESULT_LABELS: Record<string, string> = {
  pending: "Pending",
  pass: "Pass",
  fail: "Fail",
  needs_clarification: "Needs clarification",
  not_applicable: "Not applicable",
};

export const INTAKE_REVISION_REASON_LABELS: Record<string, string> = {
  client_edit: "Client edit",
  staff_edit: "Staff edit",
  changes_requested: "Changes requested",
  reopened: "Reopened",
  system_update: "System update",
  import: "Import",
};

export const INTAKE_REVISION_REASONS = Object.keys(INTAKE_REVISION_REASON_LABELS) as [string, ...string[]];

export function intakeStatusLabel(status: string | null | undefined): string {
  if (!status) return "—";
  return INTAKE_STATUS_LABELS[status] ?? status.replace(/_/g, " ");
}

export function reviewResultLabel(result: string | null | undefined): string {
  if (!result) return "—";
  return REVIEW_RESULT_LABELS[result] ?? result.replace(/_/g, " ");
}

export const assignOrganizerSchema = z.object({
  templateId: z.string().uuid("Choose an organizer template."),
  serviceId: z.string().uuid().optional().nullable(),
  dueDate: z.string().optional().nullable(),
  clientMessage: z.string().max(2000).optional().nullable(),
  internalNotes: z.string().max(2000).optional().nullable(),
});
export type AssignOrganizerInput = z.infer<typeof assignOrganizerSchema>;

export const reopenIntakeSchema = z.object({
  reason: z.string().trim().min(1, "A reason is required to reopen an intake.").max(1000),
});
export type ReopenIntakeInput = z.infer<typeof reopenIntakeSchema>;

export const requestClarificationSchema = z.object({
  fieldId: z.string().uuid().optional().nullable(),
  comment: z.string().trim().min(1, "Enter a message for the client.").max(2000),
  clientVisible: z.boolean().default(true),
});
export type RequestClarificationInput = z.infer<typeof requestClarificationSchema>;

export const resolveClarificationSchema = z.object({
  resolution: z.string().trim().min(1, "Enter a resolution note.").max(2000),
});
export type ResolveClarificationInput = z.infer<typeof resolveClarificationSchema>;

export const reviewSectionSchema = z.object({
  sectionId: z.string().uuid(),
  result: z.enum(["pending", "pass", "fail", "needs_clarification", "not_applicable"]),
  notes: z.string().max(2000).optional().nullable(),
});
export type ReviewSectionInput = z.infer<typeof reviewSectionSchema>;
