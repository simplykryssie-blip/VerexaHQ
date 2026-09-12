-- Lets an email template carry a banner image (logo header, like organizer
-- and engagement-letter templates already can) and custom CSS, so a
-- workflow's "Add Tag"-adjacent send_email step can produce a real branded
-- email instead of plain rich text. Both are sent as-is: dispatch-notifications
-- (the one place email_templates.body_html actually becomes a sent email)
-- prepends a <style> block and the banner <img>, with no HTML boilerplate/
-- CSS-inlining step existing anywhere in this pipeline today -- most modern
-- clients (Gmail, Apple Mail, Outlook.com) render a bare <style> block fine,
-- but very old Outlook desktop has always had poor CSS support regardless of
-- how it's delivered, same tradeoff as every other simple mailer.

alter table public.email_templates
  add column banner_image_url text,
  add column custom_css text;

comment on column public.email_templates.banner_image_url is 'Optional banner/logo image rendered above the template body when sent -- same pattern as organizer_templates.banner_image_url.';
comment on column public.email_templates.custom_css is 'Optional CSS injected as a <style> block when this template is sent -- same pattern as organizer_templates/engagement_letter_templates.custom_css.';
