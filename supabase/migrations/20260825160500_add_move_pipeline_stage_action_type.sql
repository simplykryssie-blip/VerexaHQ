-- move_lead_stage and move_engagement_stage are being collapsed into one
-- move_pipeline_stage action (they'll operate on the same unified table
-- going forward, so keeping two copies of the same logic would be pure
-- duplication). Additive step: allow the new value alongside the old ones
-- -- existing automation_steps rows still use the old values until the
-- follow-up migration updates them. The old values are dropped from this
-- allow-list in a later cleanup migration once that data migration lands.
alter table public.automation_steps drop constraint automation_steps_action_type_check;
alter table public.automation_steps add constraint automation_steps_action_type_check
  check (action_type = any (array[
    'send_email', 'send_sms', 'send_notification', 'create_task', 'assign_user', 'change_stage',
    'request_approval', 'delay', 'webhook', 'escalate', 'send_organizer_template', 'create_engagement',
    'send_engagement_letter', 'send_document_request', 'move_lead_stage', 'move_engagement_stage',
    'move_pipeline_stage', 'mark_lead_lost',
    'convert_lead_to_client', 'update_client', 'create_client', 'create_quote', 'send_quote',
    'add_tag', 'remove_tag', 'add_note', 'send_portal_message', 'start_workflow', 'end_workflow',
    'invite_to_portal', 'condition', 'create_appointment', 'add_dnd', 'remove_dnd',
    'move_lead_to_service_pipeline', 'business_hours_delay'
  ]));
