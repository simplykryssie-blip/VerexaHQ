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

export const ENGAGEMENT_PRIORITY_TONE: Record<string, "success" | "warning" | "danger" | "neutral" | "accent"> = {
  Low: "neutral",
  Medium: "accent",
  High: "warning",
  Urgent: "danger",
};
