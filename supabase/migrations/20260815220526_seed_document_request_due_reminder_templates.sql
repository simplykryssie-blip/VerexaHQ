insert into public.email_templates (workspace_id, name, slug, category, subject, body_html, merge_fields, status)
values (
  null,
  'Document Request Due Reminder',
  'document-request-due-reminder',
  'documents',
  'Reminder: documents needed -- {{title}}',
  E'Hi,\n\nThis is a reminder that we are still waiting on documents from you: {{title}}, due {{due_date}}.\n\nPlease log in to your client portal to upload them.\n\nThank you,\nYour tax office team',
  '["title", "due_date"]'::jsonb,
  'published'
);

insert into public.sms_templates (workspace_id, name, slug, body, status)
values (
  null,
  'Document Request Due Reminder (SMS)',
  'document-request-due-reminder-sms',
  'Reminder: documents needed for "{{title}}", due {{due_date}}. Please upload them in your client portal.',
  'published'
);
