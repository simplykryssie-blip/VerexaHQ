-- Splits the single "New Lead Welcome Email" automation into two branches
-- on the same lead.created trigger, gated by the existing
-- client.portal_status condition (already resolved live off
-- client_portal_users by evaluate_automation_conditions -- is_null means no
-- portal row exists yet, is_not_null means one already does, e.g. because
-- the organizer that captured this lead required portal signup upfront):
--
-- - Portal already exists: just welcome them and point them at what's next.
-- - No portal yet: run invite_to_portal (self-checking -- creates the
--   client_portal_users row + a pending_portal_invites row, which the
--   existing send-pending-portal-invites cron turns into the system's
--   already-built "Client Portal Invite" email with the real activation
--   link) THEN send a second, warmer welcome note that explains what
--   happens once they finish the portal. Two emails, not one -- the actual
--   activation link is generated and sent by the existing portal-invite
--   pipeline, which this reuses rather than duplicating.
do $$
declare
  v_workspace_id uuid := '74321fb2-9a18-4625-ab12-01c98e888667';
  v_no_portal_automation_id uuid := 'e049a7f8-868d-48a7-95e3-ce012cf0f25b';
  v_has_portal_automation_id uuid := gen_random_uuid();
begin
  -- No-portal-yet branch: repurpose the existing automation.
  update public.automations
  set name = 'New Lead Welcome (No Portal Yet)',
      slug = 'new-lead-welcome-no-portal',
      description = 'When a new lead has no portal account yet, invites them to the portal and sends a welcome email explaining what happens next.',
      conditions = '[{"field": "client.portal_status", "op": "is_null"}]'
  where id = v_no_portal_automation_id;

  update public.automation_steps set display_order = 1 where automation_id = v_no_portal_automation_id and display_order = 0;
  insert into public.automation_steps (automation_id, display_order, action_type, action_config)
  values (v_no_portal_automation_id, 0, 'invite_to_portal', '{}');

  update public.email_templates
  set body_html =
    'Hi {{client_name}},' || chr(10) || chr(10) ||
    'Thanks for reaching out to {{firm_name}} -- we''ve received your information and someone from our team will be in touch shortly to help with your tax needs.' || chr(10) || chr(10) ||
    'We''ve also sent you a separate email with a secure link to set up your client portal. Once you complete it -- your basic profile, any organizers we''ve assigned, and any requested documents -- our team will review everything and reach out with next steps.' || chr(10) || chr(10) ||
    'If you have any questions in the meantime, feel free to reply to this email.' || chr(10) || chr(10) ||
    'Talk soon,' || chr(10) ||
    '{{firm_name}}'
  where workspace_id = v_workspace_id and slug = 'lead-welcome-email';

  -- Portal-already-exists branch: new automation + new template.
  insert into public.email_templates (workspace_id, name, slug, subject, body_html, status, category, merge_fields)
  values (
    v_workspace_id, 'Lead Welcome Email (Portal Set Up)', 'lead-welcome-email-portal-existing',
    'Thanks for reaching out to {{firm_name}}',
    'Hi {{client_name}},' || chr(10) || chr(10) ||
    'Thanks for reaching out to {{firm_name}} -- we''ve received your information and someone from our team will be in touch shortly to help with your tax needs.' || chr(10) || chr(10) ||
    'You already have access to your client portal -- log in to complete your intake questionnaire and upload any documents we need. Once that''s done, our team will review everything and reach out with next steps.' || chr(10) || chr(10) ||
    'If you have any questions in the meantime, feel free to reply to this email.' || chr(10) || chr(10) ||
    'Talk soon,' || chr(10) ||
    '{{firm_name}}',
    'published', 'lead', '["client_name", "firm_name"]'
  );

  insert into public.automations (id, workspace_id, name, slug, description, trigger_type, conditions, is_enabled, status)
  values (
    v_has_portal_automation_id, v_workspace_id, 'New Lead Welcome (Portal Already Set Up)', 'new-lead-welcome-has-portal',
    'When a new lead already has a portal account (e.g. their organizer required signup), sends a welcome email pointing them at what to do next.',
    'lead.created', '[{"field": "client.portal_status", "op": "is_not_null"}]', true, 'published'
  );

  insert into public.automation_steps (automation_id, display_order, action_type, action_config)
  values (v_has_portal_automation_id, 0, 'send_email', jsonb_build_object('template_slug', 'lead-welcome-email-portal-existing'));
end $$;
