-- Replaces the minimal recruiting pipeline from the prior migration with a
-- full onboarding build: a "pick your package" application organizer
-- (with a real branching question -- already on VerexaHQ? -- that
-- conditionally reveals a follow-up field), a signature-required ERO
-- Partnership Agreement wired to a real service (so staff send it through
-- the same, already-working engagement e-signature flow used everywhere
-- else in the app), and a 7-stage pipeline with automations per stage.
--
-- Important, deliberate design choice: execute_automation_step's
-- create_engagement/send_engagement_letter actions only work on a run
-- triggered by an organizer submission that resolves to a service via
-- needs_service_review/resolved_service_id -- a mechanism purpose-built
-- for tax-client onboarding, not something safe to retrofit for a
-- lead.stage_entered-triggered recruiting pipeline under time pressure.
-- So sending the contract is a staff action (guided by a task the
-- automation creates), not a fully automatic step -- everything else
-- (outreach, application send, branch by answer, notify) is automatic.
do $$
declare
  v_ws uuid := 'b53cc047-e1dd-4a6e-92f4-88b3c37f48af'; -- Ascend Tax Office (ERO demo)
  v_org_id uuid;
  v_yes_no_field_id uuid;
  v_elt_id uuid;
  v_service_id uuid;
  v_proc_id uuid;
  v_stage_prospect uuid;
  v_stage_app_sent uuid;
  v_stage_existing_verexa uuid;
  v_stage_new_verexa uuid;
  v_stage_contract uuid;
  v_stage_connected uuid;
  v_stage_not_interested uuid;
  v_auto_id uuid;
begin
  -- Remove the prior, minimal recruiting-pipeline build cleanly (nothing
  -- real has been created on it yet -- safe to replace).
  delete from public.automation_step_edges where automation_id in (select id from public.automations where workspace_id = v_ws and slug like 'ptin-recruiting-%');
  delete from public.automation_steps where automation_id in (select id from public.automations where workspace_id = v_ws and slug like 'ptin-recruiting-%');
  delete from public.automations where workspace_id = v_ws and slug like 'ptin-recruiting-%';
  delete from public.process_stages where process_id in (select id from public.processes where workspace_id = v_ws and slug = 'ptin-recruiting-pipeline');
  delete from public.processes where workspace_id = v_ws and slug = 'ptin-recruiting-pipeline';
  delete from public.email_templates where workspace_id = v_ws and slug like 'ptin-recruiting-%';
  delete from public.sms_templates where workspace_id = v_ws and slug like 'ptin-recruiting-%';

  -- ==================== Application organizer ====================
  insert into public.organizer_templates (workspace_id, name, slug, description, status)
  values (v_ws, 'ERO Partnership Application', 'ero-partnership-application', 'Intake for a PTIN holder applying to join the Ascend Tax Office network.', 'published')
  returning id into v_org_id;

  insert into public.organizer_fields (organizer_template_id, field_type, label, help_text, display_order, is_required, body_html) values
    (v_org_id, 'rich_text', 'About the Program', null, 1, false,
     '<h3>Welcome to the Ascend Tax Office ERO Partnership Program</h3><p>We partner with independent PTIN holders to take the operational weight off your plate -- e-file support, IRS notice tracking, and a shared toolset -- while you keep running your own book of clients exactly as you do today. Choose the package that fits your practice below, and tell us a bit about yourself to get started.</p>');

  insert into public.organizer_fields (organizer_template_id, field_type, label, display_order, is_required, options) values
    (v_org_id, 'radio_button', 'Which partnership package interests you?', 2, true,
     jsonb_build_array(
       jsonb_build_object('label', 'Starter -- PTIN support only', 'value', 'Starter'),
       jsonb_build_object('label', 'Growth -- PTIN + shared tools + e-file support', 'value', 'Growth'),
       jsonb_build_object('label', 'Full Partnership -- PTIN + tools + marketing + billing support', 'value', 'Full Partnership')
     ));

  insert into public.organizer_fields (organizer_template_id, field_type, label, display_order, is_required) values
    (v_org_id, 'name', 'Your Name', 3, true);
  insert into public.organizer_fields (organizer_template_id, field_type, label, display_order, is_required) values
    (v_org_id, 'email', 'Email Address', 4, true);
  insert into public.organizer_fields (organizer_template_id, field_type, label, display_order, is_required) values
    (v_org_id, 'phone', 'Phone Number', 5, true);
  insert into public.organizer_fields (organizer_template_id, field_type, label, display_order, is_required) values
    (v_org_id, 'short_text', 'PTIN Number', 6, true);

  insert into public.organizer_fields (organizer_template_id, field_type, label, display_order, is_required) values
    (v_org_id, 'yes_no', 'Are you already using VerexaHQ?', 7, true)
  returning id into v_yes_no_field_id;

  insert into public.organizer_fields (organizer_template_id, field_type, label, help_text, display_order, is_required, conditional_logic) values
    (v_org_id, 'short_text', 'What email is your VerexaHQ account under?', 'We''ll send your connection invite to this address.', 8, false,
     jsonb_build_object('show_if', jsonb_build_object('match', 'any', 'conditions', jsonb_build_array(
       jsonb_build_object('field_id', v_yes_no_field_id, 'operator', 'equals', 'value', 'Yes')
     ))));

  -- ==================== Signature-required contract ====================
  insert into public.engagement_letter_templates (workspace_id, name, slug, body_html, requires_signature, status)
  values (v_ws, 'ERO Partnership Agreement', 'ero-partnership-agreement',
    '<h2>ERO Partnership Agreement</h2>' ||
    '<p>This Partnership Agreement ("Agreement") is entered into between Ascend Tax Office ("ERO") and {{client_name}} ("Partner").</p>' ||
    '<h3>1. Independent Practice</h3><p>Partner retains full ownership of and responsibility for their own client relationships. This Agreement does not transfer Partner''s clients, PTIN, or practice to the ERO.</p>' ||
    '<h3>2. Program Services</h3><p>The ERO will provide the services associated with Partner''s selected package, including e-file support and return status/IRS notice oversight through the connected Verexa account.</p>' ||
    '<h3>3. Fees</h3><p>[Fee structure for Partner''s selected package to be attached/confirmed separately.]</p>' ||
    '<h3>4. Term &amp; Termination</h3><p>This Agreement remains in effect until either party terminates the connection, which may be done at any time by disconnecting the linked Verexa workspaces.</p>' ||
    '<p>By signing below, both parties agree to the terms above.</p>',
    true, 'published')
  returning id into v_elt_id;

  -- Real service so staff create an actual engagement against this
  -- contract through the same, already-working flow used for every other
  -- signature-required engagement in the app.
  insert into public.services (workspace_id, name, slug, description, requires_engagement_letter, engagement_letter_template_id, is_bookable, is_portal_visible, status)
  values (v_ws, 'ERO Partnership Onboarding', 'ero-partnership-onboarding', 'Formalizing a new PTIN partner connection -- requires the signed ERO Partnership Agreement.', true, v_elt_id, false, false, 'published')
  returning id into v_service_id;

  -- ==================== Email templates ====================
  insert into public.email_templates (workspace_id, name, slug, category, subject, body_html, status) values
  (v_ws, 'PTIN Recruiting -- Initial Outreach', 'ptin-recruiting-initial-outreach', 'recruiting',
   'A faster way to run your PTIN practice -- from Ascend Tax Office',
   '<p>Hi {{client_first_name}},</p><p>I wanted to reach out directly -- Ascend Tax Office partners with independent PTIN holders like you to take the operational weight off your plate: e-file support, IRS notice tracking, and a shared toolset, while you keep running your own book of clients exactly as you do today.</p><p>Would you be open to a quick call to see if it''s a fit?</p><p>Best,<br/>{{sender_name}}</p>', 'published'),
  (v_ws, 'PTIN Recruiting -- Application Invitation', 'ptin-recruiting-application-invitation', 'recruiting',
   'Your Ascend Tax Office partnership application',
   '<p>Hi {{client_first_name}},</p><p>Great talking with you -- here''s a short application to pick the package that fits and tell us a bit about your practice. It only takes a couple minutes.</p><p>Best,<br/>{{sender_name}}</p>', 'published'),
  (v_ws, 'PTIN Recruiting -- Existing Verexa Connect Instructions', 'ptin-recruiting-existing-verexa-connect', 'recruiting',
   'Connecting your existing VerexaHQ account to Ascend Tax Office',
   '<p>Hi {{client_first_name}},</p><p>Thanks for confirming you''re already on VerexaHQ -- we''ll send a connection invite to the email you provided shortly. Once you accept it, your workspace links to Ascend Tax Office as your ERO, and stays fully independent otherwise.</p><p>Best,<br/>{{sender_name}}</p>', 'published'),
  (v_ws, 'PTIN Recruiting -- New to Verexa Signup Instructions', 'ptin-recruiting-new-verexa-signup', 'recruiting',
   'Getting started on VerexaHQ',
   '<p>Hi {{client_first_name}},</p><p>Since you''re new to VerexaHQ, here''s how to get set up:</p><ol><li>Go to verexahq.com and create your own workspace (choose "Independent PTIN").</li><li>Once you''re in, come back to us and we''ll send you a connection invite to link your new workspace to Ascend Tax Office as your ERO.</li></ol><p>Reach out any time if you need a hand.</p><p>Best,<br/>{{sender_name}}</p>', 'published'),
  (v_ws, 'PTIN Recruiting -- Contract Coming', 'ptin-recruiting-contract-coming', 'recruiting',
   'Next step -- your ERO Partnership Agreement',
   '<p>Hi {{client_first_name}},</p><p>You''re almost there -- we''ll be sending over the ERO Partnership Agreement for your signature shortly so we can formalize the partnership.</p><p>Best,<br/>{{sender_name}}</p>', 'published'),
  (v_ws, 'PTIN Recruiting -- Welcome Aboard', 'ptin-recruiting-welcome-aboard', 'recruiting',
   'Welcome to the Ascend Tax Office network!',
   '<p>Hi {{client_first_name}},</p><p>You''re officially connected with Ascend Tax Office. Reach out any time in the meantime.</p><p>Welcome aboard,<br/>{{sender_name}}</p>', 'published');

  -- ==================== SMS templates ====================
  insert into public.sms_templates (workspace_id, name, slug, body, status)
  values (v_ws, 'PTIN Recruiting -- Check Your Email', 'ptin-recruiting-check-your-email',
    'Hi {{client_first_name}}, we just sent you your Ascend Tax Office partnership application -- check your email to get started!', 'published');

  -- ==================== Pipeline ====================
  insert into public.processes (workspace_id, name, slug, description, status)
  values (v_ws, 'PTIN Recruiting Pipeline', 'ptin-recruiting-pipeline', 'Tracks a prospective PTIN holder from first outreach through a signed, connected partnership.', 'published')
  returning id into v_proc_id;

  insert into public.process_stages (process_id, name, display_order) values (v_proc_id, 'Prospect Identified', 1) returning id into v_stage_prospect;
  insert into public.process_stages (process_id, name, display_order) values (v_proc_id, 'Application Sent', 2) returning id into v_stage_app_sent;
  insert into public.process_stages (process_id, name, display_order) values (v_proc_id, 'Existing Verexa User', 3) returning id into v_stage_existing_verexa;
  insert into public.process_stages (process_id, name, display_order) values (v_proc_id, 'New to Verexa', 4) returning id into v_stage_new_verexa;
  insert into public.process_stages (process_id, name, display_order) values (v_proc_id, 'Contract Sent', 5) returning id into v_stage_contract;
  insert into public.process_stages (process_id, name, display_order) values (v_proc_id, 'Connected', 6) returning id into v_stage_connected;
  insert into public.process_stages (process_id, name, display_order) values (v_proc_id, 'Not Interested', 7) returning id into v_stage_not_interested;

  -- ==================== Automations ====================
  insert into public.automations (workspace_id, name, slug, description, trigger_type, trigger_config, is_enabled, status)
  values (v_ws, 'PTIN Recruiting -- New Prospect', 'ptin-recruiting-new-prospect', 'Fires when a prospective PTIN holder is added to the recruiting pipeline.',
    'lead.stage_entered', jsonb_build_object('process_id', v_proc_id, 'process_stage_id', v_stage_prospect), true, 'published')
  returning id into v_auto_id;
  insert into public.automation_steps (automation_id, display_order, action_type, action_config) values
    (v_auto_id, 1, 'add_tag', jsonb_build_object('tag', 'PTIN Prospect')),
    (v_auto_id, 2, 'send_email', jsonb_build_object('template_slug', 'ptin-recruiting-initial-outreach')),
    (v_auto_id, 3, 'create_task', jsonb_build_object('title', 'Follow up on outreach to {{client_name}}', 'priority', 'medium', 'due_in_days', '3'));

  insert into public.automations (workspace_id, name, slug, description, trigger_type, trigger_config, is_enabled, status)
  values (v_ws, 'PTIN Recruiting -- Application Sent', 'ptin-recruiting-application-sent', 'Sends the pick-your-package application organizer to the prospect.',
    'lead.stage_entered', jsonb_build_object('process_id', v_proc_id, 'process_stage_id', v_stage_app_sent), true, 'published')
  returning id into v_auto_id;
  insert into public.automation_steps (automation_id, display_order, action_type, action_config) values
    (v_auto_id, 1, 'send_email', jsonb_build_object('template_slug', 'ptin-recruiting-application-invitation')),
    (v_auto_id, 2, 'send_organizer_template', jsonb_build_object('organizer_template_id', v_org_id)),
    (v_auto_id, 3, 'send_sms', jsonb_build_object('template_slug', 'ptin-recruiting-check-your-email')),
    (v_auto_id, 4, 'create_task', jsonb_build_object('title', 'Review {{client_name}}''s submitted application -- package + VerexaHQ status', 'priority', 'medium', 'due_in_days', '4'));

  insert into public.automations (workspace_id, name, slug, description, trigger_type, trigger_config, is_enabled, status)
  values (v_ws, 'PTIN Recruiting -- Existing Verexa User', 'ptin-recruiting-existing-verexa-user', 'Fires when staff move a prospect here after they answered Yes on the application.',
    'lead.stage_entered', jsonb_build_object('process_id', v_proc_id, 'process_stage_id', v_stage_existing_verexa), true, 'published')
  returning id into v_auto_id;
  insert into public.automation_steps (automation_id, display_order, action_type, action_config) values
    (v_auto_id, 1, 'send_email', jsonb_build_object('template_slug', 'ptin-recruiting-existing-verexa-connect')),
    (v_auto_id, 2, 'create_task', jsonb_build_object('title', 'Generate a connection invite and send it to {{client_name}}''s VerexaHQ email', 'priority', 'high', 'due_in_days', '1'));

  insert into public.automations (workspace_id, name, slug, description, trigger_type, trigger_config, is_enabled, status)
  values (v_ws, 'PTIN Recruiting -- New to Verexa', 'ptin-recruiting-new-to-verexa', 'Fires when staff move a prospect here after they answered No on the application.',
    'lead.stage_entered', jsonb_build_object('process_id', v_proc_id, 'process_stage_id', v_stage_new_verexa), true, 'published')
  returning id into v_auto_id;
  insert into public.automation_steps (automation_id, display_order, action_type, action_config) values
    (v_auto_id, 1, 'send_email', jsonb_build_object('template_slug', 'ptin-recruiting-new-verexa-signup')),
    (v_auto_id, 2, 'create_task', jsonb_build_object('title', 'Check back with {{client_name}} on VerexaHQ signup', 'priority', 'medium', 'due_in_days', '3'));

  insert into public.automations (workspace_id, name, slug, description, trigger_type, trigger_config, is_enabled, status)
  values (v_ws, 'PTIN Recruiting -- Contract Sent', 'ptin-recruiting-contract-sent', 'Fires when a prospect is ready for the ERO Partnership Agreement.',
    'lead.stage_entered', jsonb_build_object('process_id', v_proc_id, 'process_stage_id', v_stage_contract), true, 'published')
  returning id into v_auto_id;
  insert into public.automation_steps (automation_id, display_order, action_type, action_config) values
    (v_auto_id, 1, 'send_email', jsonb_build_object('template_slug', 'ptin-recruiting-contract-coming')),
    (v_auto_id, 2, 'create_task', jsonb_build_object('title', 'Create an ERO Partnership Onboarding engagement for {{client_name}} and send the Partnership Agreement for signature', 'priority', 'high', 'due_in_days', '1'));

  insert into public.automations (workspace_id, name, slug, description, trigger_type, trigger_config, is_enabled, status)
  values (v_ws, 'PTIN Recruiting -- Connected', 'ptin-recruiting-connected', 'Fires once the prospect has signed and actually accepted the real connection invite.',
    'lead.stage_entered', jsonb_build_object('process_id', v_proc_id, 'process_stage_id', v_stage_connected), true, 'published')
  returning id into v_auto_id;
  insert into public.automation_steps (automation_id, display_order, action_type, action_config) values
    (v_auto_id, 1, 'send_email', jsonb_build_object('template_slug', 'ptin-recruiting-welcome-aboard')),
    (v_auto_id, 2, 'add_tag', jsonb_build_object('tag', 'Active PTIN Partner')),
    (v_auto_id, 3, 'remove_tag', jsonb_build_object('tag', 'PTIN Prospect'));

  insert into public.automations (workspace_id, name, slug, description, trigger_type, trigger_config, is_enabled, status)
  values (v_ws, 'PTIN Recruiting -- Not Interested', 'ptin-recruiting-not-interested', 'Fires when a prospect declines to partner.',
    'lead.stage_entered', jsonb_build_object('process_id', v_proc_id, 'process_stage_id', v_stage_not_interested), true, 'published')
  returning id into v_auto_id;
  insert into public.automation_steps (automation_id, display_order, action_type, action_config) values
    (v_auto_id, 1, 'add_tag', jsonb_build_object('tag', 'PTIN Recruiting - Declined')),
    (v_auto_id, 2, 'remove_tag', jsonb_build_object('tag', 'PTIN Prospect')),
    (v_auto_id, 3, 'mark_lead_lost', jsonb_build_object('reason', 'Declined ERO partnership'));
end $$;
