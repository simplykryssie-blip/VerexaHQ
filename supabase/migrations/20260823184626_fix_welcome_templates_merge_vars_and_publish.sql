-- Two bugs found while wiring the reminder step onto this same automation:
-- 1. lead-welcome-email's subject used {{client_first_name}}, but the
--    automation context only ever populates {{first_name}} (its body
--    already correctly uses {{first_name}}) -- the subject rendered with a
--    blank in that slot.
-- 2. welcom_sms_new_lead (the slug the "New Leads Enter CRM" automation's
--    send_sms step actually references) was left in 'draft' status, so
--    every welcome SMS send has been failing outright ("No published SMS
--    template for key..."), and its body used {{client_first_name}} /
--    {{firm_phone}} instead of the real payload keys {{first_name}} /
--    {{office_phone}}.
update public.email_templates
set subject = 'Welcome to Verexa Tax Office {{first_name}} — Let’s Get Started'
where slug = 'lead-welcome-email' and workspace_id = '74321fb2-9a18-4625-ab12-01c98e888667';

update public.sms_templates
set body = 'Hi {{first_name}},
Thank you for choosing Verexa HQ. Please check your email. If you do not see an email from us in your inbox, please check your spam, promotions or notifications tab.

Talk soon,
{{firm_name}}
{{office_phone}}',
    status = 'published'
where slug = 'welcom_sms_new_lead' and workspace_id = '74321fb2-9a18-4625-ab12-01c98e888667';
