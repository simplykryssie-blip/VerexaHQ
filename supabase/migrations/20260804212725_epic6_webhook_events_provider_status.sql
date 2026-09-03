-- Generic, provider-agnostic inbound webhook log + retry tracking.
-- One table for Stripe/Resend/Twilio (and any future provider) instead of
-- one table per vendor.
create table public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('stripe','resend','twilio')),
  event_type text not null,
  external_id text,
  workspace_id uuid references public.workspaces(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'received' check (status in ('received','processed','failed')),
  attempts integer not null default 0,
  last_error text,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);
create index idx_webhook_events_provider on public.webhook_events (provider, received_at desc);
create index idx_webhook_events_external_id on public.webhook_events (external_id);
create index idx_webhook_events_status on public.webhook_events (status) where status = 'failed';

alter table public.webhook_events enable row level security;

-- Written only by server routes using the service-role key (webhooks arrive
-- unauthenticated, same as the existing Stripe webhook route). Staff can
-- read their own workspace's events for troubleshooting; platform-wide
-- events (workspace_id null) are visible to platform admins only.
create policy webhook_events_select on public.webhook_events
  for select using (
    (workspace_id is not null and public.is_workspace_member(workspace_id))
    or public.is_platform_admin()
  );

-- Platform-level health of our own Resend/Twilio/Stripe accounts. Not
-- workspace-scoped -- these are our shared vendor credentials, not a
-- per-tenant setting (that's branding/system_settings' job).
create table public.provider_status (
  provider text primary key check (provider in ('email','sms','stripe')),
  is_configured boolean not null default false,
  status text not null default 'unknown' check (status in ('unknown','healthy','degraded','down')),
  consecutive_failures integer not null default 0,
  last_check_at timestamptz,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now()
);
insert into public.provider_status (provider) values ('email'), ('sms'), ('stripe');

alter table public.provider_status enable row level security;

-- Read-only operational signal every staff member benefits from seeing
-- (e.g. "SMS provider is degraded" banner); nothing sensitive in the row.
create policy provider_status_select on public.provider_status
  for select using (auth.uid() is not null);

create trigger set_updated_at before update on public.provider_status
  for each row execute function public.set_updated_at();

-- Called by server routes (service role) after every send attempt/webhook
-- receipt to record provider health. security definer so it can be called
-- by any authenticated context without a dedicated write policy.
create or replace function public.record_provider_check(p_provider text, p_success boolean, p_error text default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  update public.provider_status
  set is_configured = true,
      status = case when p_success then 'healthy' else (case when consecutive_failures + 1 >= 3 then 'down' else 'degraded' end) end,
      consecutive_failures = case when p_success then 0 else consecutive_failures + 1 end,
      last_check_at = now(),
      last_success_at = case when p_success then now() else last_success_at end,
      last_failure_at = case when p_success then last_failure_at else now() end,
      last_error = case when p_success then null else p_error end,
      updated_at = now()
  where provider = p_provider;
end;
$$;
revoke execute on function public.record_provider_check(text, boolean, text) from public, anon;
