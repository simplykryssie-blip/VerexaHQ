-- Builds a real, working "PTIN Recruiting" pipeline for Ascend Tax Office
-- (the ERO demo workspace) -- a prospect PTIN holder is tracked as a lead
-- through this pipeline the same way a tax client moves through any other
-- process in this app (drag the card, lead.stage_entered fires the wired
-- automation). This is separate from the real firm_connections
-- invite/accept mechanism (Settings > Connections): this pipeline is for
-- tracking and communicating with a prospect BEFORE/around that real
-- invite gets sent, not a replacement for it.
do $$
declare
  v_ws uuid := 'b53cc047-e1dd-4a6e-92f4-88b3c37f48af'; -- Ascend Tax Office (ERO demo)
  v_proc_id uuid;
  v_stage_prospect uuid;
  v_stage_invite_sent uuid;
  v_stage_following_up uuid;
  v_stage_connected uuid;
  v_stage_not_interested uuid;
  v_auto_id uuid;
begin
  insert into public.processes (workspace_id, name, slug, description, status)
  values (v_ws, 'PTIN Recruiting Pipeline', 'ptin-recruiting-pipeline', 'Tracks a prospective PTIN holder from first outreach through connecting under this ERO.', 'published')
  returning id into v_proc_id;

  insert into public.process_stages (process_id, name, display_order) values (v_proc_id, 'Prospect Identified', 1) returning id into v_stage_prospect;
  insert into public.process_stages (process_id, name, display_order) values (v_proc_id, 'Invite Sent', 2) returning id into v_stage_invite_sent;
  insert into public.process_stages (process_id, name, display_order) values (v_proc_id, 'Following Up', 3) returning id into v_stage_following_up;
  insert into public.process_stages (process_id, name, display_order) values (v_proc_id, 'Connected', 4) returning id into v_stage_connected;
  insert into public.process_stages (process_id, name, display_order) values (v_proc_id, 'Not Interested', 5) returning id into v_stage_not_interested;

  -- Email templates
  insert into public.email_templates (workspace_id, name, slug, category, subject, body_html, status)
  values (v_ws, 'PTIN Recruiting -- Initial Outreach', 'ptin-recruiting-initial-outreach', 'recruiting',
    'A faster way to run your PTIN practice -- from Ascend Tax Office',
    '<p>Hi {{client_first_name}},</p><p>I wanted to reach out directly -- Ascend Tax Office partners with independent PTIN holders like you to take the operational weight off your plate: e-file support, IRS notice tracking, and a shared toolset, while you keep running your own book of clients exactly as you do today.</p><p>Would you be open to a quick call to see if it's a fit?</p><p>Best,<br/>{{sender_name}}</p>',
    'published');

  insert into public.email_templates (workspace_id, name, slug, category, subject, body_html, status)
  values (v_ws, 'PTIN Recruiting -- Invite Link', 'ptin-recruiting-invite-link', 'recruiting',
    'Your invite to connect with Ascend Tax Office',
    '<p>Hi {{client_first_name}},</p><p>Great talking with you -- here''s your invite to connect your account with Ascend Tax Office. Your practice stays fully independent; connecting just links us up so we can support your returns and keep an eye on anything that needs attention.</p><p>Reach out any time if you have questions before accepting.</p><p>Best,<br/>{{sender_name}}</p>',
    'published');

  insert into public.email_templates (workspace_id, name, slug, category, subject, body_html, status)
  values (v_ws, 'PTIN Recruiting -- Follow-Up', 'ptin-recruiting-follow-up', 'recruiting',
    'Following up -- Ascend Tax Office',
    '<p>Hi {{client_first_name}},</p><p>Just following up on the invite to connect with Ascend Tax Office -- happy to answer any questions or hop on a quick call if that''s easier.</p><p>Best,<br/>{{sender_name}}</p>',
    'published');

  insert into public.email_templates (workspace_id, name, slug, category, subject, body_html, status)
  values (v_ws, 'PTIN Recruiting -- Welcome Aboard', 'ptin-recruiting-welcome-aboard', 'recruiting',
    'Welcome to the Ascend Tax Office network!',
    '<p>Hi {{client_first_name}},</p><p>You''re officially connected with Ascend Tax Office. Next up, we''ll confirm your branding and billing settings together -- reach out any time in the meantime.</p><p>Welcome aboard,<br/>{{sender_name}}</p>',
    'published');

  -- SMS templates
  insert into public.sms_templates (workspace_id, name, slug, body, status)
  values (v_ws, 'PTIN Recruiting -- Check Your Email', 'ptin-recruiting-check-your-email',
    'Hi {{client_first_name}}, we just sent you an invite to connect with Ascend Tax Office -- check your email to get started!', 'published');

  insert into public.sms_templates (workspace_id, name, slug, body, status)
  values (v_ws, 'PTIN Recruiting -- Following Up', 'ptin-recruiting-following-up',
    'Hi {{client_first_name}}, just following up on the invite to join Ascend Tax Office''s network. Let us know if you have questions!', 'published');

  -- Automations, one per stage, all trigger_type lead.stage_entered
  insert into public.automations (workspace_id, name, slug, description, trigger_type, trigger_config, is_enabled, status)
  values (v_ws, 'PTIN Recruiting -- New Prospect', 'ptin-recruiting-new-prospect', 'Fires when a prospective PTIN holder is added to the recruiting pipeline.',
    'lead.stage_entered', jsonb_build_object('process_id', v_proc_id, 'process_stage_id', v_stage_prospect), true, 'published')
  returning id into v_auto_id;
  insert into public.automation_steps (automation_id, display_order, action_type, action_config) values
    (v_auto_id, 1, 'add_tag', jsonb_build_object('tag', 'PTIN Prospect')),
    (v_auto_id, 2, 'send_email', jsonb_build_object('template_slug', 'ptin-recruiting-initial-outreach')),
    (v_auto_id, 3, 'create_task', jsonb_build_object('title', 'Follow up on outreach to {{client_name}}', 'priority', 'medium', 'due_in_days', '3'));

  insert into public.automations (workspace_id, name, slug, description, trigger_type, trigger_config, is_enabled, status)
  values (v_ws, 'PTIN Recruiting -- Invite Sent', 'ptin-recruiting-invite-sent-automation', 'Fires once an invite has gone out to the prospect.',
    'lead.stage_entered', jsonb_build_object('process_id', v_proc_id, 'process_stage_id', v_stage_invite_sent), true, 'published')
  returning id into v_auto_id;
  insert into public.automation_steps (automation_id, display_order, action_type, action_config) values
    (v_auto_id, 1, 'send_email', jsonb_build_object('template_slug', 'ptin-recruiting-invite-link')),
    (v_auto_id, 2, 'send_sms', jsonb_build_object('template_slug', 'ptin-recruiting-check-your-email')),
    (v_auto_id, 3, 'create_task', jsonb_build_object('title', 'Confirm {{client_name}} received/accepted the invite', 'priority', 'medium', 'due_in_days', '4'));

  insert into public.automations (workspace_id, name, slug, description, trigger_type, trigger_config, is_enabled, status)
  values (v_ws, 'PTIN Recruiting -- Following Up', 'ptin-recruiting-following-up-automation', 'Fires when a prospect needs a follow-up nudge.',
    'lead.stage_entered', jsonb_build_object('process_id', v_proc_id, 'process_stage_id', v_stage_following_up), true, 'published')
  returning id into v_auto_id;
  insert into public.automation_steps (automation_id, display_order, action_type, action_config) values
    (v_auto_id, 1, 'send_email', jsonb_build_object('template_slug', 'ptin-recruiting-follow-up')),
    (v_auto_id, 2, 'send_sms', jsonb_build_object('template_slug', 'ptin-recruiting-following-up')),
    (v_auto_id, 3, 'create_task', jsonb_build_object('title', 'Personal follow-up with {{client_name}}', 'priority', 'high', 'due_in_days', '2'));

  insert into public.automations (workspace_id, name, slug, description, trigger_type, trigger_config, is_enabled, status)
  values (v_ws, 'PTIN Recruiting -- Connected', 'ptin-recruiting-connected', 'Fires once the prospect has actually accepted the real connection invite.',
    'lead.stage_entered', jsonb_build_object('process_id', v_proc_id, 'process_stage_id', v_stage_connected), true, 'published')
  returning id into v_auto_id;
  insert into public.automation_steps (automation_id, display_order, action_type, action_config) values
    (v_auto_id, 1, 'send_email', jsonb_build_object('template_slug', 'ptin-recruiting-welcome-aboard')),
    (v_auto_id, 2, 'add_tag', jsonb_build_object('tag', 'Active PTIN Partner')),
    (v_auto_id, 3, 'remove_tag', jsonb_build_object('tag', 'PTIN Prospect')),
    (v_auto_id, 4, 'create_task', jsonb_build_object('title', 'Confirm branding/billing settings with {{client_name}}', 'priority', 'medium', 'due_in_days', '2'));

  insert into public.automations (workspace_id, name, slug, description, trigger_type, trigger_config, is_enabled, status)
  values (v_ws, 'PTIN Recruiting -- Not Interested', 'ptin-recruiting-not-interested', 'Fires when a prospect declines to partner.',
    'lead.stage_entered', jsonb_build_object('process_id', v_proc_id, 'process_stage_id', v_stage_not_interested), true, 'published')
  returning id into v_auto_id;
  insert into public.automation_steps (automation_id, display_order, action_type, action_config) values
    (v_auto_id, 1, 'add_tag', jsonb_build_object('tag', 'PTIN Recruiting - Declined')),
    (v_auto_id, 2, 'remove_tag', jsonb_build_object('tag', 'PTIN Prospect')),
    (v_auto_id, 3, 'mark_lead_lost', jsonb_build_object('reason', 'Declined ERO partnership'));
end $$;
