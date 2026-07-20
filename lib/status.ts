// Centralized status-mapping layer for the Work module and Service Workspace.
//
// `platform_canonical_statuses` exists in the database (domains: client,
// service, engagement, task, document_request, portal_invitation) but is
// verified disconnected from live enforcement — its snake_case codes
// ("not_started", "ready_for_review", ...) do not match what the live CHECK
// constraints and RPCs actually write (e.g. tasks.task_status uses
// "To Do"/"In Progress"/"Completed", services.service_status uses
// "New"/"In Progress"/"Completed"). Until that registry is wired to
// enforcement, this module is the single place that knows the live values
// per domain, so status strings and staff-vs-client label differences are
// not repeated inline across components.

export type StatusDomain =
  | "engagement"
  | "service"
  | "task"
  | "document"
  | "invoice"
  | "form_assignment"
  | "organizer_assignment";

type Audience = "staff" | "client";

// Client-facing label overrides — only set where the internal operational
// label would be confusing or alarming to a client (e.g. "Requested" reads
// fine internally, but a client sees it as "we need this from you").
const CLIENT_LABELS: Partial<Record<StatusDomain, Record<string, string>>> = {
  document: {
    Requested: "We need this from you",
    Needed: "We need this from you",
    Missing: "We need this from you",
    Uploaded: "Received — under review",
    Accepted: "Approved",
  },
  service: {
    Completed: "Complete",
  },
  engagement: {
    completed: "Complete",
    in_progress: "In progress",
    active: "In progress",
  },
};

export function statusLabel(
  domain: StatusDomain,
  raw: string | null | undefined,
  audience: Audience = "staff",
): string {
  if (!raw) return "—";
  if (audience === "client") {
    const override = CLIENT_LABELS[domain]?.[raw];
    if (override) return override;
  }
  return raw;
}

const OPEN_TASK = new Set(["to do", "in progress", "blocked", "waiting"]);
const CLOSED_TASK = new Set(["completed", "done", "cancelled", "canceled", "archived"]);

export function isOpenTaskStatus(raw: string | null | undefined): boolean {
  const v = (raw ?? "").toLowerCase().trim();
  if (CLOSED_TASK.has(v)) return false;
  if (OPEN_TASK.has(v)) return true;
  return v.length > 0;
}

const CLOSED_ENGAGEMENT = new Set(["completed", "complete", "cancelled", "canceled"]);

export function isOpenEngagementStatus(raw: string | null | undefined): boolean {
  return !CLOSED_ENGAGEMENT.has((raw ?? "").toLowerCase().trim());
}

const CLOSED_SERVICE = new Set(["completed", "complete", "cancelled", "canceled"]);

export function isOpenServiceStatus(raw: string | null | undefined): boolean {
  return !CLOSED_SERVICE.has((raw ?? "").toLowerCase().trim());
}

const OPEN_INVOICE = new Set(["sent", "viewed", "partial", "overdue"]);

export function isOpenInvoiceStatus(raw: string | null | undefined): boolean {
  return OPEN_INVOICE.has((raw ?? "").toLowerCase().trim());
}

const OPEN_DOCUMENT = new Set(["needed", "requested", "missing", "in review", "under review"]);

export function isDocumentAwaitingClient(raw: string | null | undefined): boolean {
  return OPEN_DOCUMENT.has((raw ?? "").toLowerCase().trim());
}

// Recommends the single next action a staff member should take on an
// engagement, from data already present on v_engagement_workspace rows.
// Returns null when nothing is clearly blocking (workspace is on track).
export function nextEngagementAction(row: {
  missing_documents: number;
  open_forms: number;
  unmet_requirements: number;
  open_tasks: number;
  current_stage_ready: boolean;
}): string | null {
  if (row.missing_documents > 0) return "Waiting on client documents";
  if (row.open_forms > 0) return "Waiting on client forms";
  if (row.unmet_requirements > 0) return "Unmet stage requirements";
  if (!row.current_stage_ready) return "Review stage requirements";
  if (row.open_tasks > 0) return "Open tasks";
  return null;
}
