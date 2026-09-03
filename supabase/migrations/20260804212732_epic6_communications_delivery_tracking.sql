alter table public.email_log add column if not exists delivered_at timestamptz;
alter table public.email_log add column if not exists opened_at timestamptz;
alter table public.email_log add column if not exists bounced_at timestamptz;
alter table public.email_log add column if not exists open_count integer not null default 0;
alter table public.email_log add column if not exists failed_reason text;

alter table public.sms_log add column if not exists delivered_at timestamptz;
alter table public.sms_log add column if not exists failed_reason text;

create index if not exists idx_email_log_provider_reference on public.email_log (provider_reference);
create index if not exists idx_sms_log_provider_reference on public.sms_log (provider_reference);
