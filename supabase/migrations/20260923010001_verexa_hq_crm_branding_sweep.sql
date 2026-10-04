-- Public-facing "Verexa"/"VerexaHQ" strings become "Verexa HQ CRM" -- an
-- unrelated electric company owns the Verexa.com domain and trademark, so
-- the platform's own name needs to stay clearly disambiguated everywhere a
-- real person (not just staff) sees it. These four global (workspace_id is
-- null) email templates are the only live rows with the bare name in their
-- subject/body; no sms_templates rows matched. A plain string replace is
-- safe here since none of the four already contain "Verexa HQ CRM".
update public.email_templates
set subject = replace(subject, 'Verexa', 'Verexa HQ CRM'),
    body_html = replace(body_html, 'Verexa', 'Verexa HQ CRM')
where workspace_id is null
  and slug in ('billing-card-reminder', 'billing-payment-failed', 'quote-accepted-staff-notification', 'quote-declined-staff-notification');
