-- enqueue_reminder_notifications() has been enqueuing jobs into
-- notification_queue for these 6 reminder types since before this
-- session, but remove_system_templates appears to have wiped their
-- matching email_templates/sms_templates rows along with everything else
-- it removed except portal-invite-email. dispatch-notifications can't
-- find a template for any of them, so every one of these reminders has
-- been silently dead-lettering (marked 'failed' in notification_queue
-- after max_attempts) with no visible error anywhere a user would see it.
-- This seeds the missing global (workspace_id null) templates so they
-- actually send. signature_due only ever enqueues Email in
-- enqueue_reminder_notifications(), so no SMS variant is needed for it.

insert into public.email_templates (workspace_id, name, slug, category, subject, body_html, merge_fields, status)
values
  (null, 'Invoice Due Reminder', 'invoice-due-reminder', 'billing',
   'Invoice {{invoice_number}} due {{due_date}}',
   E'Hi,\n\nThis is a reminder that invoice {{invoice_number}} for ${{amount_due}} is due {{due_date}}.\n\nPlease log in to your client portal to view and pay this invoice.\n\nThank you.',
   '["invoice_number", "due_date", "amount_due"]'::jsonb, 'published'),
  (null, 'Signature Due Reminder', 'signature-due-reminder', 'documents',
   'Signature needed: {{document_title}}',
   E'Hi {{signer_name}},\n\nThis is a reminder that your signature is needed on "{{document_title}}", due {{due_date}}.\n\nPlease check your email for the signing link, or contact our office if you can''t find it.\n\nThank you.',
   '["signer_name", "document_title", "due_date"]'::jsonb, 'published'),
  (null, 'Workflow Stage Due Reminder', 'workflow-stage-due-reminder', 'workflow',
   'Stage due soon: {{stage_name}}',
   E'Hi,\n\nThe "{{stage_name}}" stage is due {{due_date}}. Please review and take action.\n\nView it in Verexa.',
   '["stage_name", "due_date"]'::jsonb, 'published'),
  (null, 'Appointment Reminder', 'appointment-reminder', 'appointments',
   'Upcoming appointment: {{title}}',
   E'Hi,\n\nThis is a reminder about the upcoming appointment "{{title}}" on {{start_at}}.\n\nLocation: {{location}}\n\nThank you.',
   '["title", "start_at", "location"]'::jsonb, 'published'),
  (null, 'Funds Received Reminder', 'funds-received-reminder', 'billing',
   'Expected payment: invoice {{invoice_number}}',
   E'Hi,\n\nInvoice {{invoice_number}} (${{amount_due}}) has an expected deposit date of {{expected_deposit_date}} via {{payment_method}}. Please confirm receipt of funds and update the invoice status.\n\nThank you.',
   '["invoice_number", "expected_deposit_date", "payment_method", "amount_due"]'::jsonb, 'published'),
  (null, 'Subscription Renewal Reminder', 'subscription-renewal-reminder', 'billing',
   'Your Verexa subscription renews {{renewal_date}}',
   E'Hi,\n\nYour Verexa subscription is scheduled to renew on {{renewal_date}}. No action is needed unless you would like to make changes to your plan or payment method.\n\nThank you.',
   '["renewal_date"]'::jsonb, 'published');

insert into public.sms_templates (workspace_id, name, slug, body, status)
values
  (null, 'Invoice Due Reminder (SMS)', 'invoice-due-reminder-sms',
   'Reminder: invoice {{invoice_number}} (${{amount_due}}) is due {{due_date}}. Please log in to your client portal to pay.', 'published'),
  (null, 'Workflow Stage Due Reminder (SMS)', 'workflow-stage-due-reminder-sms',
   'Reminder: the "{{stage_name}}" stage is due {{due_date}}.', 'published'),
  (null, 'Appointment Reminder (SMS)', 'appointment-reminder-sms',
   'Reminder: "{{title}}" on {{start_at}}. Location: {{location}}.', 'published'),
  (null, 'Funds Received Reminder (SMS)', 'funds-received-reminder-sms',
   'Reminder: invoice {{invoice_number}} expected deposit {{expected_deposit_date}} via {{payment_method}} (${{amount_due}}).', 'published'),
  (null, 'Subscription Renewal Reminder (SMS)', 'subscription-renewal-reminder-sms',
   'Your Verexa subscription renews on {{renewal_date}}.', 'published');
