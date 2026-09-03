
insert into public.email_templates (workspace_id, slug, name, category, subject, body_html, status, merge_fields)
values
  (null, 'appointment-reminder', 'Appointment reminder', 'operations',
   'Reminder: {{title}}',
   '<p>Hi,</p><p>This is a reminder for your upcoming appointment: <strong>{{title}}</strong>.</p><p>When: {{start_at}}<br/>Where: {{location}}</p>',
   'published', '["title","start_at","location"]'::jsonb)
on conflict (workspace_id, slug) do nothing;
