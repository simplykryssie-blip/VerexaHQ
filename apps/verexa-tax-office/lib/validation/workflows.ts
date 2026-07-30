import type { Enums } from "@/types/database";

type WorkflowRunStatus = Enums<"workflow_run_status">;
type WorkflowStepStatus = Enums<"workflow_step_status">;
type WorkflowNodeType = Enums<"workflow_node_type">;
type WorkflowTriggerType = Enums<"workflow_trigger_type">;
type ApprovalStatus = Enums<"approval_status">;

export const WORKFLOW_RUN_STATUS_LABELS: Record<WorkflowRunStatus, string> = {
  queued: "Queued",
  running: "Running",
  waiting: "Waiting",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
};

export const WORKFLOW_STEP_STATUS_LABELS: Record<WorkflowStepStatus, string> = {
  pending: "Pending",
  ready: "Ready",
  running: "Running",
  waiting: "Waiting",
  completed: "Completed",
  skipped: "Skipped",
  failed: "Failed",
  cancelled: "Cancelled",
};

export const WORKFLOW_NODE_TYPE_LABELS: Record<WorkflowNodeType, string> = {
  start: "Start",
  trigger: "Trigger",
  condition: "Condition",
  task: "Create task",
  approval: "Approval",
  assignment: "Assignment",
  wait: "Wait",
  email: "Send email",
  sms: "Send SMS",
  portal_notification: "Portal notification",
  document_request: "Document request",
  status_change: "Status change",
  form_assignment: "Assign form",
  webhook: "Webhook",
  parallel_split: "Split (parallel)",
  parallel_join: "Join (parallel)",
  end: "End",
};

export const WORKFLOW_TRIGGER_LABELS: Record<WorkflowTriggerType, string> = {
  manual: "Manual",
  engagement_created: "Engagement created",
  engagement_status_changed: "Engagement status changed",
  form_assigned: "Form assigned",
  form_submitted: "Form submitted",
  document_uploaded: "Document uploaded",
  document_request_completed: "Document request completed",
  invoice_paid: "Invoice paid",
  signature_completed: "Signature completed",
  date_reached: "Date reached",
  scheduled: "Scheduled",
  client_portal_activated: "Client portal activated",
  relationship_created: "Relationship created",
};

export const APPROVAL_STATUS_LABELS: Record<ApprovalStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  changes_requested: "Changes requested",
  cancelled: "Cancelled",
};

export const WORKFLOW_NODE_TYPES = Object.keys(WORKFLOW_NODE_TYPE_LABELS) as [WorkflowNodeType, ...WorkflowNodeType[]];
export const WORKFLOW_TRIGGER_TYPES = Object.keys(WORKFLOW_TRIGGER_LABELS) as [WorkflowTriggerType, ...WorkflowTriggerType[]];

export function workflowRunStatusLabel(v: string | null | undefined): string {
  if (!v) return "—";
  return (WORKFLOW_RUN_STATUS_LABELS as Record<string, string>)[v] ?? v.replace(/_/g, " ");
}
export function workflowStepStatusLabel(v: string | null | undefined): string {
  if (!v) return "—";
  return (WORKFLOW_STEP_STATUS_LABELS as Record<string, string>)[v] ?? v.replace(/_/g, " ");
}
export function workflowNodeTypeLabel(v: string | null | undefined): string {
  if (!v) return "—";
  return (WORKFLOW_NODE_TYPE_LABELS as Record<string, string>)[v] ?? v.replace(/_/g, " ");
}
export function workflowTriggerLabel(v: string | null | undefined): string {
  if (!v) return "—";
  return (WORKFLOW_TRIGGER_LABELS as Record<string, string>)[v] ?? v.replace(/_/g, " ");
}
export function approvalStatusLabel(v: string | null | undefined): string {
  if (!v) return "—";
  return (APPROVAL_STATUS_LABELS as Record<string, string>)[v] ?? v.replace(/_/g, " ");
}
