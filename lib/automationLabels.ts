// Mirrors the action list in components/workflows/WorkflowBuilder.tsx (ACTION_TYPES)
// so staff-facing status displays can show the same plain-language labels
// builders see when configuring a step, instead of the raw action_type value.
export const AUTOMATION_ACTION_LABELS: Record<string, string> = {
  delay: "Wait / Delay",
  business_hours_delay: "Wait (business hours)",
  condition: "Condition",
  send_email: "Send an email",
  send_sms: "Send a text",
  create_task: "Create a task",
  create_appointment: "Schedule an appointment (request)",
  send_organizer_template: "Push an organizer to the client's portal",
  create_engagement: "Create the engagement and start its pipeline",
  send_engagement_letter: "Send the engagement letter for signature",
  change_stage: "Advance to the next pipeline stage",
  send_document_request: "Send a document request",
  assign_user: "Assign staff",
  send_notification: "Notify a staff member",
  move_pipeline_stage: "Move to a pipeline stage",
  move_lead_to_service_pipeline: "Move the lead to the pipeline matching their service",
  mark_lead_lost: "Mark the lead lost",
  convert_lead_to_client: "Convert the lead to an active client",
  update_client: "Update a client field",
  create_client: "Create a new client",
  create_quote: "Create a quote",
  send_quote: "Send the draft quote",
  add_tag: "Add a tag to the client",
  remove_tag: "Remove a tag from the client",
  invite_to_portal: "Invite client to portal",
  add_note: "Add an internal note",
  send_portal_message: "Send a portal message",
  start_workflow: "Start another workflow",
  end_workflow: "End this workflow",
  webhook: "Call a webhook",
  add_dnd: "Opt the client out of SMS/email",
  remove_dnd: "Opt the client back into SMS/email",
};

export function automationActionLabel(actionType: string | null | undefined): string {
  if (!actionType) return "Unknown step";
  return AUTOMATION_ACTION_LABELS[actionType] ?? actionType;
}
