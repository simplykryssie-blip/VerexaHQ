
alter table public.branding
  add column if not exists reply_to_email text,
  add column if not exists billing_email text,
  add column if not exists notification_email text;
