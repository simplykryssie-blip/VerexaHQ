-- Fresh SMS/email copy for the MKB workflow rebuild -- nothing carried
-- over from the GHL originals, per explicit instruction. Scoped to the
-- MKB workspace only.
insert into public.sms_templates (workspace_id, name, slug, body, merge_fields, status) values
  (
    '9d3e27c8-e7ed-4db0-a0ce-9b2fa0fe23c7',
    'Consult Booking Reminder',
    'mkb-consult-booking-reminder',
    'Hi {{client_name}}, this is {{firm_name}}. We''d love to get your consultation on the calendar -- reply here or give us a call and we''ll find a time that works. Talk soon!',
    '["client_name", "firm_name"]'::jsonb,
    'published'
  ),
  (
    '9d3e27c8-e7ed-4db0-a0ce-9b2fa0fe23c7',
    'Consult No-Show Follow-Up',
    'mkb-no-show-followup',
    'Hi {{client_name}}, we missed you at your scheduled consultation with {{firm_name}}. No worries -- reply here or give us a call and we''ll get you rebooked.',
    '["client_name", "firm_name"]'::jsonb,
    'published'
  );

insert into public.email_templates (workspace_id, name, slug, category, subject, body_html, merge_fields, status) values
  (
    '9d3e27c8-e7ed-4db0-a0ce-9b2fa0fe23c7',
    'Consult Booking Reminder',
    'mkb-consult-booking-reminder',
    'lead_nurture',
    'Let''s get your consultation scheduled',
    E'<p>Hi {{client_name}},</p><p>Thanks for your interest in working with {{firm_name}}. We haven\'t been able to connect on a time for your consultation yet -- reply to this email or give our office a call and we\'ll find a time that works for you.</p><p>We look forward to speaking with you.</p><p>{{firm_name}}</p>',
    '["client_name", "firm_name"]'::jsonb,
    'published'
  ),
  (
    '9d3e27c8-e7ed-4db0-a0ce-9b2fa0fe23c7',
    'Consult No-Show Follow-Up',
    'mkb-no-show-followup',
    'lead_nurture',
    'We missed you today',
    E'<p>Hi {{client_name}},</p><p>We had you down for a consultation with {{firm_name}} and wanted to check in since we weren\'t able to connect. Life happens -- reply to this email or call our office and we\'ll get you rescheduled at a time that works better.</p><p>Looking forward to connecting.</p><p>{{firm_name}}</p>',
    '["client_name", "firm_name"]'::jsonb,
    'published'
  ),
  (
    '9d3e27c8-e7ed-4db0-a0ce-9b2fa0fe23c7',
    'Payment Link',
    'mkb-payment-link',
    'billing',
    'Your invoice from {{firm_name}}',
    E'<p>Hi {{client_name}},</p><p>Your invoice is ready. Please log in to your client portal to review and submit payment at your convenience.</p><p>Questions? Just reply to this email.</p><p>Thank you,<br>{{firm_name}}</p>',
    '["client_name", "firm_name"]'::jsonb,
    'published'
  );
