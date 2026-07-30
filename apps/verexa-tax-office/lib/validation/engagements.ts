// Verbatim from generated database types — never invent values here.
export const RETURN_TYPES = [
  "1040",
  "1040-X",
  "1065",
  "1120",
  "1120-S",
  "1041",
  "706",
  "709",
  "990",
  "941",
  "940",
  "state_individual",
  "state_business",
  "local",
  "other",
] as const;

export const ENGAGEMENT_TYPES = [
  "individual_return",
  "business_return",
  "amended_return",
  "extension",
  "tax_planning",
  "bookkeeping",
  "payroll",
  "other",
  "individual",
  "business",
  "nonprofit",
  "extension_only",
  "notice_resolution",
] as const;

export const ENGAGEMENT_PRIORITIES = ["low", "normal", "high", "urgent"] as const;

export const ENGAGEMENT_STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  intake_not_started: "Intake not started",
  intake_in_progress: "Intake in progress",
  missing_documents: "Missing documents",
  documents_requested: "Documents requested",
  ready_for_preparation: "Ready for preparation",
  preparation_in_progress: "In preparation",
  in_preparation: "In preparation",
  internal_review: "Internal review",
  preparer_review: "Preparer review",
  reviewer_review: "Reviewer review",
  awaiting_payment: "Awaiting payment",
  awaiting_signature: "Awaiting signature",
  ready_for_ero: "Ready for ERO",
  sent_to_tax_software: "Sent to tax software",
  transmitted_externally: "Transmitted",
  acknowledgement_pending: "Acknowledgement pending",
  accepted: "Accepted",
  rejected: "Rejected",
  correction_in_progress: "Correction in progress",
  ready_to_file: "Ready to file",
  filed: "Filed",
  extended: "Extended",
  on_hold: "On hold",
  completed: "Completed",
  cancelled: "Cancelled",
  archived: "Archived",
  awaiting_client: "Awaiting client",
};

export function engagementStatusLabel(status: string): string {
  return ENGAGEMENT_STATUS_LABELS[status] ?? status.replace(/_/g, " ");
}
