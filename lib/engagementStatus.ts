// Shared with StatusSelect (engagement detail page) and the Engagements
// board view, so both always show the same pipeline in the same order.
export const ENGAGEMENT_STATUS_OPTIONS = [
  "New",
  "Waiting On Client",
  "Waiting On Staff",
  "In Progress",
  "Waiting On Review",
  "Corrections Requested",
  "Approved",
  "Waiting On Signature",
  "Waiting On Payment",
  "Ready To Release",
  "Completed",
  "Archived",
];

// What each status *means*, not a decorative color -- done is done,
// blocked-on-someone is a wait, everything else is active/in motion.
export const ENGAGEMENT_STATUS_TONE: Record<string, "success" | "warning" | "danger" | "neutral" | "accent"> = {
  New: "accent",
  "Waiting On Client": "warning",
  "Waiting On Staff": "warning",
  "In Progress": "accent",
  "Waiting On Review": "warning",
  "Corrections Requested": "danger",
  Approved: "accent",
  "Waiting On Signature": "warning",
  "Waiting On Payment": "warning",
  "Ready To Release": "accent",
  Completed: "success",
  Archived: "neutral",
};

// Statuses that assume a signed engagement letter is on file. Staff can
// still move an engagement here without one (a confirmation dialog warns
// them first -- see StatusSelect/EngagementBoard), so this list also
// drives the persistent warning shown on the engagement page itself,
// which is the only signal for engagements that reach one of these
// statuses through pipeline completion rather than a manual status change
// (advance_pipeline_on_stage_completed has no UI moment to show a dialog).
export const SIGNATURE_GATED_STATUSES = ["Waiting On Payment", "Ready To Release", "Completed"];

// "Open" means still active in the pipeline -- everything except the two
// terminal statuses. One shared source of truth for the Dashboard's "Open
// Engagements" KPI, the Engagements list's ?status=open filter, and the
// client-level "Open engagements"/"Current engagement" stat tiles, so all
// of them always agree on the same set instead of drifting via separately
// hardcoded status checks.
export const CLOSED_ENGAGEMENT_STATUSES = ["Completed", "Archived"];

export function isOpenEngagementStatus(status: string): boolean {
  return !CLOSED_ENGAGEMENT_STATUSES.includes(status);
}

export const ENGAGEMENT_PRIORITY_TONE: Record<string, "success" | "warning" | "danger" | "neutral" | "accent"> = {
  Low: "neutral",
  Medium: "accent",
  High: "warning",
  Urgent: "danger",
};

// Status of an engagement_shares row (a filing shared with a connected ERO
// for review) -- shared between the engagement detail page and Review Queue.
export const ENGAGEMENT_SHARE_STATUS_TONE: Record<string, "success" | "warning" | "danger" | "neutral" | "accent"> = {
  pending: "warning",
  corrections_requested: "danger",
  approved: "success",
};
