-- Rebuilds MKB Financial Group's GHL automation suite natively in Verexa,
-- per explicit direction: use their GHL workflows as a functional base,
-- but with a fresh Verexa-native tag taxonomy and fresh SMS/email copy
-- (nothing carried over verbatim), and scoped to the MKB workspace only
-- -- nothing here is shared with or copied into any other workspace.
--
-- Two deliberate simplifications versus the GHL originals, both scoped
-- down rather than expanded (documented so they're easy to revisit):
--   1. GHL's "Payment Tag Added" trigger OR'd two separate tags (deposit
--      paid / paid in full) into one workflow. Verexa's tag-added trigger
--      matches one tag per automation, so the two are consolidated here
--      into a single "payment:received" tag applied whenever either kind
--      of payment lands -- one automation instead of two near-duplicates.
--   2. GHL's invoice-link workflow branched on a free-form "Payment/
--      Invoice Link" contact field that has no equivalent in Verexa's
--      client schema (no generic custom-fields system), and its
--      downstream "Find Opportunity -> Payment monitor" task duplicated
--      what the payment-follow-up workflow (payment:link-sent) already
--      does. Simplified to: send the payment email, tag it sent, clear
--      the trigger tag.
--
-- Every automation is created with is_enabled = false so nothing fires
-- automatically -- review each one in the canvas builder and flip it on
-- when ready.
do $$
declare
  v_workspace_id uuid := '9d3e27c8-e7ed-4db0-a0ce-9b2fa0fe23c7';
  v_process_id uuid := '49d78942-bdb9-4034-b3e3-d01b86d7f722';
  v_stage_new uuid := 'e6d4d742-7d7c-4e1b-b6cb-a13c309d54a2';
  v_stage_consult_needed uuid := '39b10d84-2fd6-4e6c-9fac-cc7f051263db';
  v_stage_consult_booked uuid := '0a0cad4f-c801-46c2-af06-81b0fd69b842';
  v_stage_consult_completed uuid := '3d4c96dd-2334-4f29-89ce-7e73f160c65d';
  v_stage_invoice_sent uuid := '9fdbb033-472d-4910-bebd-28257a6bb179';
  v_stage_active_client uuid := '83be2d55-89c5-4c69-9fef-b6eaa355848d';
  v_krystal uuid := '817d1585-9c4f-448c-bc8c-b0c3e7a50904';

  v_automation_id uuid;
  v_cond_step uuid;
  v_step1 uuid;
  v_step2 uuid;
  v_step3 uuid;
  v_step4 uuid;
  v_step5 uuid;
begin
  ----------------------------------------------------------------------
  -- A1: Tax Prep Lead Routing
  ----------------------------------------------------------------------
  insert into public.automations (workspace_id, name, slug, description, trigger_type, trigger_config, is_enabled, status)
  values (v_workspace_id, 'MKB -- Tax Prep Lead Routing', 'mkb-tax-prep-lead-routing',
    'When a lead is tagged as interested in tax prep, route them into the Revenue Pipeline.',
    'client.tag_added', jsonb_build_object('tag', 'lead:interest-tax-prep'), false, 'published')
  returning id into v_automation_id;

  insert into public.automation_steps (automation_id, action_type, action_config, display_order)
  values (v_automation_id, 'condition', '{}'::jsonb, 0) returning id into v_cond_step;
  insert into public.automation_steps (automation_id, action_type, action_config, display_order) values
    (v_automation_id, 'move_lead_stage', jsonb_build_object('process_id', v_process_id, 'process_stage_id', v_stage_new), 1),
    (v_automation_id, 'add_tag', jsonb_build_object('tag', 'route:tax-prep-complete'), 2);
  select id into v_step1 from public.automation_steps where automation_id = v_automation_id and display_order = 1;
  select id into v_step2 from public.automation_steps where automation_id = v_automation_id and display_order = 2;

  insert into public.automation_step_edges (automation_id, from_step_id, to_step_id, branch_conditions, label, sort_order) values
    (v_automation_id, v_cond_step, null, jsonb_build_array(jsonb_build_object('field', 'client.tags', 'op', 'eq', 'value', 'route:tax-prep-complete')), 'Already routed', 0),
    (v_automation_id, v_cond_step, v_step1, null, 'None', 1),
    (v_automation_id, v_step1, v_step2, null, null, 0);

  ----------------------------------------------------------------------
  -- A2: Consult Prep Task (appointment confirmed)
  ----------------------------------------------------------------------
  insert into public.automations (workspace_id, name, slug, description, trigger_type, trigger_config, is_enabled, status)
  values (v_workspace_id, 'MKB -- Consult Prep Task', 'mkb-consult-prep-task',
    'When a consult appointment is confirmed, move the lead to Consult Booked and give Krystal a prep task.',
    'appointment.status_changed', jsonb_build_object('to_status', 'confirmed'), false, 'published')
  returning id into v_automation_id;

  insert into public.automation_steps (automation_id, action_type, action_config, display_order)
  values (v_automation_id, 'condition', '{}'::jsonb, 0) returning id into v_cond_step;
  insert into public.automation_steps (automation_id, action_type, action_config, display_order) values
    (v_automation_id, 'move_lead_stage', jsonb_build_object('process_id', v_process_id, 'process_stage_id', v_stage_consult_booked), 1),
    (v_automation_id, 'create_task', jsonb_build_object('title', 'Prep for upcoming consult', 'assigned_staff_id', v_krystal, 'due_in_days', 1, 'priority', 'medium'), 2),
    (v_automation_id, 'add_tag', jsonb_build_object('tag', 'prep-task:created'), 3),
    (v_automation_id, 'add_tag', jsonb_build_object('tag', 'consult:booked'), 4);
  select id into v_step1 from public.automation_steps where automation_id = v_automation_id and display_order = 1;
  select id into v_step2 from public.automation_steps where automation_id = v_automation_id and display_order = 2;
  select id into v_step3 from public.automation_steps where automation_id = v_automation_id and display_order = 3;
  select id into v_step4 from public.automation_steps where automation_id = v_automation_id and display_order = 4;

  insert into public.automation_step_edges (automation_id, from_step_id, to_step_id, branch_conditions, label, sort_order) values
    (v_automation_id, v_cond_step, null, jsonb_build_array(jsonb_build_object('field', 'client.tags', 'op', 'eq', 'value', 'prep-task:created')), 'Prep task already created', 0),
    (v_automation_id, v_cond_step, v_step1, null, 'None', 1),
    (v_automation_id, v_step1, v_step2, null, null, 0),
    (v_automation_id, v_step2, v_step3, null, null, 0),
    (v_automation_id, v_step3, v_step4, null, null, 0);

  ----------------------------------------------------------------------
  -- A3: Consult Booking Reminder (entered Consult Needed stage)
  ----------------------------------------------------------------------
  insert into public.automations (workspace_id, name, slug, description, trigger_type, trigger_config, is_enabled, status)
  values (v_workspace_id, 'MKB -- Consult Booking Reminder', 'mkb-consult-booking-reminder',
    'When a lead enters the Consult Needed stage, send a booking reminder and follow up a day later.',
    'lead.stage_entered', jsonb_build_object('process_id', v_process_id, 'process_stage_id', v_stage_consult_needed), false, 'published')
  returning id into v_automation_id;

  insert into public.automation_steps (automation_id, action_type, action_config, display_order)
  values (v_automation_id, 'condition', '{}'::jsonb, 0) returning id into v_cond_step;
  insert into public.automation_steps (automation_id, action_type, action_config, delay_minutes, display_order) values
    (v_automation_id, 'send_sms', jsonb_build_object('template_slug', 'mkb-consult-booking-reminder'), 0, 1),
    (v_automation_id, 'send_email', jsonb_build_object('template_slug', 'mkb-consult-booking-reminder'), 0, 2),
    (v_automation_id, 'add_tag', jsonb_build_object('tag', 'consult:reminder-sent'), 0, 3),
    (v_automation_id, 'create_task', jsonb_build_object('title', 'Check consult lead response', 'assigned_staff_id', v_krystal, 'due_in_days', 1, 'priority', 'medium'), 1440, 4);
  select id into v_step1 from public.automation_steps where automation_id = v_automation_id and display_order = 1;
  select id into v_step2 from public.automation_steps where automation_id = v_automation_id and display_order = 2;
  select id into v_step3 from public.automation_steps where automation_id = v_automation_id and display_order = 3;
  select id into v_step4 from public.automation_steps where automation_id = v_automation_id and display_order = 4;

  insert into public.automation_step_edges (automation_id, from_step_id, to_step_id, branch_conditions, label, sort_order) values
    (v_automation_id, v_cond_step, null, jsonb_build_array(jsonb_build_object('field', 'client.tags', 'op', 'eq', 'value', 'consult:reminder-sent')), 'Reminder already sent', 0),
    (v_automation_id, v_cond_step, v_step1, null, 'None', 1),
    (v_automation_id, v_step1, v_step2, null, null, 0),
    (v_automation_id, v_step2, v_step3, null, null, 0),
    (v_automation_id, v_step3, v_step4, null, null, 0);

  ----------------------------------------------------------------------
  -- A4: Consult Completed Follow-Up
  ----------------------------------------------------------------------
  insert into public.automations (workspace_id, name, slug, description, trigger_type, trigger_config, is_enabled, status)
  values (v_workspace_id, 'MKB -- Consult Completed Follow-Up', 'mkb-consult-completed-followup',
    'When a lead enters the Consult Completed stage, give Krystal a follow-up task on next steps.',
    'lead.stage_entered', jsonb_build_object('process_id', v_process_id, 'process_stage_id', v_stage_consult_completed), false, 'published')
  returning id into v_automation_id;

  insert into public.automation_steps (automation_id, action_type, action_config, display_order)
  values (v_automation_id, 'condition', '{}'::jsonb, 0) returning id into v_cond_step;
  insert into public.automation_steps (automation_id, action_type, action_config, display_order) values
    (v_automation_id, 'create_task', jsonb_build_object('title', 'Follow up after consult -- next steps', 'assigned_staff_id', v_krystal, 'due_in_days', 1, 'priority', 'medium'), 1),
    (v_automation_id, 'add_tag', jsonb_build_object('tag', 'consult:followup-task-created'), 2);
  select id into v_step1 from public.automation_steps where automation_id = v_automation_id and display_order = 1;
  select id into v_step2 from public.automation_steps where automation_id = v_automation_id and display_order = 2;

  insert into public.automation_step_edges (automation_id, from_step_id, to_step_id, branch_conditions, label, sort_order) values
    (v_automation_id, v_cond_step, null, jsonb_build_array(jsonb_build_object('field', 'client.tags', 'op', 'eq', 'value', 'consult:followup-task-created')), 'Follow-up task already created', 0),
    (v_automation_id, v_cond_step, v_step1, null, 'None', 1),
    (v_automation_id, v_step1, v_step2, null, null, 0);

  ----------------------------------------------------------------------
  -- A5: No-Show Follow-Up
  ----------------------------------------------------------------------
  insert into public.automations (workspace_id, name, slug, description, trigger_type, trigger_config, is_enabled, status)
  values (v_workspace_id, 'MKB -- No-Show Follow-Up', 'mkb-no-show-followup',
    'When a consult appointment is marked no-show, send a reschedule nudge and flag it for Krystal to review.',
    'appointment.status_changed', jsonb_build_object('to_status', 'no_show'), false, 'published')
  returning id into v_automation_id;

  insert into public.automation_steps (automation_id, action_type, action_config, display_order)
  values (v_automation_id, 'condition', '{}'::jsonb, 0) returning id into v_cond_step;
  insert into public.automation_steps (automation_id, action_type, action_config, display_order) values
    (v_automation_id, 'move_lead_stage', jsonb_build_object('process_id', v_process_id, 'process_stage_id', v_stage_consult_needed), 1),
    (v_automation_id, 'send_sms', jsonb_build_object('template_slug', 'mkb-no-show-followup'), 2),
    (v_automation_id, 'send_email', jsonb_build_object('template_slug', 'mkb-no-show-followup'), 3),
    (v_automation_id, 'add_tag', jsonb_build_object('tag', 'consult:no-show'), 4),
    (v_automation_id, 'create_task', jsonb_build_object('title', 'Review no-show lead', 'assigned_staff_id', v_krystal, 'due_in_days', 1, 'priority', 'medium'), 5);
  select id into v_step1 from public.automation_steps where automation_id = v_automation_id and display_order = 1;
  select id into v_step2 from public.automation_steps where automation_id = v_automation_id and display_order = 2;
  select id into v_step3 from public.automation_steps where automation_id = v_automation_id and display_order = 3;
  select id into v_step4 from public.automation_steps where automation_id = v_automation_id and display_order = 4;
  select id into v_step5 from public.automation_steps where automation_id = v_automation_id and display_order = 5;

  insert into public.automation_step_edges (automation_id, from_step_id, to_step_id, branch_conditions, label, sort_order) values
    (v_automation_id, v_cond_step, null, jsonb_build_array(jsonb_build_object('field', 'client.tags', 'op', 'eq', 'value', 'consult:no-show')), 'Already marked no-show', 0),
    (v_automation_id, v_cond_step, v_step1, null, 'None', 1),
    (v_automation_id, v_step1, v_step2, null, null, 0),
    (v_automation_id, v_step2, v_step3, null, null, 0),
    (v_automation_id, v_step3, v_step4, null, null, 0),
    (v_automation_id, v_step4, v_step5, null, null, 0);

  ----------------------------------------------------------------------
  -- A6: Payment Link Follow-Up
  ----------------------------------------------------------------------
  insert into public.automations (workspace_id, name, slug, description, trigger_type, trigger_config, is_enabled, status)
  values (v_workspace_id, 'MKB -- Payment Link Follow-Up', 'mkb-payment-link-followup',
    'When a payment link is sent, move to Invoice Sent and check back on it a day later if unpaid.',
    'client.tag_added', jsonb_build_object('tag', 'payment:link-sent'), false, 'published')
  returning id into v_automation_id;

  insert into public.automation_steps (automation_id, action_type, action_config, display_order)
  values (v_automation_id, 'condition', '{}'::jsonb, 0) returning id into v_cond_step;
  insert into public.automation_steps (automation_id, action_type, action_config, delay_minutes, display_order) values
    (v_automation_id, 'move_lead_stage', jsonb_build_object('process_id', v_process_id, 'process_stage_id', v_stage_invoice_sent), 0, 1),
    (v_automation_id, 'create_task', jsonb_build_object('title', 'Follow up on payment status', 'assigned_staff_id', v_krystal, 'due_in_days', 1, 'priority', 'medium'), 1440, 2),
    (v_automation_id, 'add_tag', jsonb_build_object('tag', 'payment:followup-task-created'), 0, 3);
  select id into v_step1 from public.automation_steps where automation_id = v_automation_id and display_order = 1;
  select id into v_step2 from public.automation_steps where automation_id = v_automation_id and display_order = 2;
  select id into v_step3 from public.automation_steps where automation_id = v_automation_id and display_order = 3;

  insert into public.automation_step_edges (automation_id, from_step_id, to_step_id, branch_conditions, label, sort_order) values
    (v_automation_id, v_cond_step, null, jsonb_build_array(jsonb_build_object('field', 'client.tags', 'op', 'eq', 'value', 'payment:followup-task-created')), 'Follow-up task already created', 0),
    (v_automation_id, v_cond_step, v_step1, null, 'None', 1),
    (v_automation_id, v_step1, v_step2, null, null, 0),
    (v_automation_id, v_step2, v_step3, null, null, 0);

  ----------------------------------------------------------------------
  -- A7: Package Recommendation
  ----------------------------------------------------------------------
  insert into public.automations (workspace_id, name, slug, description, trigger_type, trigger_config, is_enabled, status)
  values (v_workspace_id, 'MKB -- Package Recommendation', 'mkb-package-recommendation',
    'When a consult outcome recommends a package, and the lead has an active pipeline entry, task Krystal to send it.',
    'client.tag_added', jsonb_build_object('tag', 'consult:outcome-recommend-package'), false, 'published')
  returning id into v_automation_id;

  insert into public.automation_steps (automation_id, action_type, action_config, display_order)
  values (v_automation_id, 'condition', '{}'::jsonb, 0) returning id into v_cond_step;
  insert into public.automation_steps (automation_id, action_type, action_config, display_order) values
    (v_automation_id, 'create_task', jsonb_build_object('title', 'Recommend service package', 'assigned_staff_id', v_krystal, 'due_in_days', 1, 'priority', 'medium'), 1),
    (v_automation_id, 'add_tag', jsonb_build_object('tag', 'package:recommended'), 2);
  select id into v_step1 from public.automation_steps where automation_id = v_automation_id and display_order = 1;
  select id into v_step2 from public.automation_steps where automation_id = v_automation_id and display_order = 2;

  insert into public.automation_step_edges (automation_id, from_step_id, to_step_id, branch_conditions, label, sort_order) values
    (v_automation_id, v_cond_step, v_step1, jsonb_build_array(jsonb_build_object('field', 'lead.process_stage_id', 'op', 'is_not_null', 'value', '')), 'Has an active pipeline entry', 0),
    (v_automation_id, v_cond_step, null, null, 'None', 1),
    (v_automation_id, v_step1, v_step2, null, null, 0);

  ----------------------------------------------------------------------
  -- A8: Active Client Onboarding
  ----------------------------------------------------------------------
  insert into public.automations (workspace_id, name, slug, description, trigger_type, trigger_config, is_enabled, status)
  values (v_workspace_id, 'MKB -- Active Client Onboarding', 'mkb-active-client-onboarding',
    'When payment is received, move the lead to Active Client and kick off onboarding.',
    'client.tag_added', jsonb_build_object('tag', 'payment:received'), false, 'published')
  returning id into v_automation_id;

  insert into public.automation_steps (automation_id, action_type, action_config, display_order)
  values (v_automation_id, 'condition', '{}'::jsonb, 0) returning id into v_cond_step;
  insert into public.automation_steps (automation_id, action_type, action_config, display_order) values
    (v_automation_id, 'move_lead_stage', jsonb_build_object('process_id', v_process_id, 'process_stage_id', v_stage_active_client), 1),
    (v_automation_id, 'add_tag', jsonb_build_object('tag', 'onboarding:needed'), 2),
    (v_automation_id, 'add_tag', jsonb_build_object('tag', 'onboarding:active-client'), 3),
    (v_automation_id, 'create_task', jsonb_build_object('title', 'Onboard new active client', 'assigned_staff_id', v_krystal, 'due_in_days', 2, 'priority', 'medium'), 4),
    (v_automation_id, 'add_tag', jsonb_build_object('tag', 'onboarding:task-created'), 5);
  select id into v_step1 from public.automation_steps where automation_id = v_automation_id and display_order = 1;
  select id into v_step2 from public.automation_steps where automation_id = v_automation_id and display_order = 2;
  select id into v_step3 from public.automation_steps where automation_id = v_automation_id and display_order = 3;
  select id into v_step4 from public.automation_steps where automation_id = v_automation_id and display_order = 4;
  select id into v_step5 from public.automation_steps where automation_id = v_automation_id and display_order = 5;

  insert into public.automation_step_edges (automation_id, from_step_id, to_step_id, branch_conditions, label, sort_order) values
    (v_automation_id, v_cond_step, null, jsonb_build_array(jsonb_build_object('field', 'client.tags', 'op', 'eq', 'value', 'onboarding:task-created')), 'Onboarding already started', 0),
    (v_automation_id, v_cond_step, v_step1, null, 'None', 1),
    (v_automation_id, v_step1, v_step2, null, null, 0),
    (v_automation_id, v_step2, v_step3, null, null, 0),
    (v_automation_id, v_step3, v_step4, null, null, 0),
    (v_automation_id, v_step4, v_step5, null, null, 0);

  ----------------------------------------------------------------------
  -- A9: Invoice Link Delivery
  ----------------------------------------------------------------------
  insert into public.automations (workspace_id, name, slug, description, trigger_type, trigger_config, is_enabled, status)
  values (v_workspace_id, 'MKB -- Invoice Link Delivery', 'mkb-invoice-link-delivery',
    'When an invoice is marked ready to send, email the client the payment link.',
    'client.tag_added', jsonb_build_object('tag', 'invoice:ready-to-send'), false, 'published')
  returning id into v_automation_id;

  insert into public.automation_steps (automation_id, action_type, action_config, display_order)
  values (v_automation_id, 'condition', '{}'::jsonb, 0) returning id into v_cond_step;
  insert into public.automation_steps (automation_id, action_type, action_config, display_order) values
    (v_automation_id, 'send_email', jsonb_build_object('template_slug', 'mkb-payment-link'), 1),
    (v_automation_id, 'add_tag', jsonb_build_object('tag', 'invoice:sent'), 2),
    (v_automation_id, 'remove_tag', jsonb_build_object('tag', 'invoice:ready-to-send'), 3);
  select id into v_step1 from public.automation_steps where automation_id = v_automation_id and display_order = 1;
  select id into v_step2 from public.automation_steps where automation_id = v_automation_id and display_order = 2;
  select id into v_step3 from public.automation_steps where automation_id = v_automation_id and display_order = 3;

  insert into public.automation_step_edges (automation_id, from_step_id, to_step_id, branch_conditions, label, sort_order) values
    (v_automation_id, v_cond_step, null, jsonb_build_array(jsonb_build_object('field', 'client.tags', 'op', 'eq', 'value', 'invoice:sent')), 'Invoice already sent', 0),
    (v_automation_id, v_cond_step, v_step1, null, 'None', 1),
    (v_automation_id, v_step1, v_step2, null, null, 0),
    (v_automation_id, v_step2, v_step3, null, null, 0);

  ----------------------------------------------------------------------
  -- A10: Tax Prep Onboarding
  ----------------------------------------------------------------------
  insert into public.automations (workspace_id, name, slug, description, trigger_type, trigger_config, is_enabled, status)
  values (v_workspace_id, 'MKB -- Tax Prep Onboarding', 'mkb-tax-prep-onboarding',
    'When a lead selects the tax prep service, move them to Active Client and kick off onboarding.',
    'client.tag_added', jsonb_build_object('tag', 'service:tax-prep-selected'), false, 'published')
  returning id into v_automation_id;

  insert into public.automation_steps (automation_id, action_type, action_config, display_order)
  values (v_automation_id, 'condition', '{}'::jsonb, 0) returning id into v_cond_step;
  insert into public.automation_steps (automation_id, action_type, action_config, display_order) values
    (v_automation_id, 'move_lead_stage', jsonb_build_object('process_id', v_process_id, 'process_stage_id', v_stage_active_client), 1),
    (v_automation_id, 'add_tag', jsonb_build_object('tag', 'onboarding:needed'), 2),
    (v_automation_id, 'add_tag', jsonb_build_object('tag', 'onboarding:active-client'), 3),
    (v_automation_id, 'create_task', jsonb_build_object('title', 'Onboard new tax prep client', 'assigned_staff_id', v_krystal, 'due_in_days', 2, 'priority', 'medium'), 4),
    (v_automation_id, 'add_tag', jsonb_build_object('tag', 'onboarding:task-created'), 5);
  select id into v_step1 from public.automation_steps where automation_id = v_automation_id and display_order = 1;
  select id into v_step2 from public.automation_steps where automation_id = v_automation_id and display_order = 2;
  select id into v_step3 from public.automation_steps where automation_id = v_automation_id and display_order = 3;
  select id into v_step4 from public.automation_steps where automation_id = v_automation_id and display_order = 4;
  select id into v_step5 from public.automation_steps where automation_id = v_automation_id and display_order = 5;

  insert into public.automation_step_edges (automation_id, from_step_id, to_step_id, branch_conditions, label, sort_order) values
    (v_automation_id, v_cond_step, null, jsonb_build_array(jsonb_build_object('field', 'client.tags', 'op', 'eq', 'value', 'onboarding:task-created')), 'Onboarding already started', 0),
    (v_automation_id, v_cond_step, v_step1, null, 'None', 1),
    (v_automation_id, v_step1, v_step2, null, null, 0),
    (v_automation_id, v_step2, v_step3, null, null, 0),
    (v_automation_id, v_step3, v_step4, null, null, 0),
    (v_automation_id, v_step4, v_step5, null, null, 0);
end $$;
