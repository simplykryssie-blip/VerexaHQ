-- New-lead welcome automation for Verexa HQ CRM. Fires on lead.created,
-- which is a raw AFTER INSERT trigger on public.clients (any row landing
-- with lifecycle_status = 'lead', the column default) -- so it covers
-- every entry path (public organizer signup, manual staff entry, a future
-- bulk import) without needing a separate automation per channel.
--
-- send_email's merge context for a client-only run (no engagement yet,
-- per execute_automation_step in 20260816130000_automation_actions_batch.sql)
-- only populates {{client_name}} and {{firm_name}} -- engagement_number/
-- status stay empty since a lead has no engagement. Template written to
-- match exactly those two tokens.
do $$
declare
  v_workspace_id uuid := '74321fb2-9a18-4625-ab12-01c98e888667';
  v_automation_id uuid := gen_random_uuid();
begin
  insert into public.email_templates (workspace_id, name, slug, subject, body_html, status, category, merge_fields)
  values (
    v_workspace_id, 'Lead Welcome Email', 'lead-welcome-email',
    'Thanks for reaching out to {{firm_name}}',
    'Hi {{client_name}},' || chr(10) || chr(10) ||
    'Thanks for reaching out to {{firm_name}} -- we''ve received your information and someone from our team will be in touch shortly to help with your tax needs.' || chr(10) || chr(10) ||
    'If you have any questions in the meantime, feel free to reply to this email.' || chr(10) || chr(10) ||
    'Talk soon,' || chr(10) ||
    '{{firm_name}}',
    'published', 'lead', '["client_name", "firm_name"]'
  );

  insert into public.automations (id, workspace_id, name, slug, description, trigger_type, is_enabled, status)
  values (
    v_automation_id, v_workspace_id, 'New Lead Welcome Email', 'new-lead-welcome-email',
    'Sends a welcome email the moment a new lead is created, no matter how they entered the CRM.',
    'lead.created', true, 'published'
  );

  insert into public.automation_steps (automation_id, display_order, action_type, action_config)
  values (v_automation_id, 0, 'send_email', jsonb_build_object('template_slug', 'lead-welcome-email'));
end $$;
