-- Real usage-based top-up billing: every workspace on a paid plan gets a
-- one-time free bucket of emails/SMS (granted once, never refilled -- once
-- crossed, every unit after is billed forever) and a permanent free storage
-- ceiling (billed each period for whatever sits above it, since storage is a
-- running total rather than a depleting event count). A monthly cron job
-- reads real usage from email_log/sms_log/attachments and charges the
-- overage via a Stripe invoice item added to the workspace's next invoice.

alter table public.platform_subscription_plans
  add column if not exists signup_free_emails integer not null default 0,
  add column if not exists signup_free_sms integer not null default 0,
  add column if not exists signup_free_storage_gb numeric not null default 0;

update public.platform_subscription_plans set
  signup_free_emails = case slug when 'solo' then 1000 when 'team' then 3000 when 'firm' then 7000 else signup_free_emails end,
  signup_free_sms = case slug when 'solo' then 100 when 'team' then 300 when 'firm' then 700 else signup_free_sms end,
  signup_free_storage_gb = case slug when 'solo' then 5 when 'team' then 20 when 'firm' then 50 else signup_free_storage_gb end
where slug in ('solo', 'team', 'firm');

create table public.workspace_usage_meters (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  resource_type text not null check (resource_type in ('email', 'sms', 'storage')),
  free_units_granted numeric not null default 0,
  billed_units_total numeric not null default 0,
  granted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, resource_type)
);

alter table public.workspace_usage_meters enable row level security;

create policy "Platform admins can view usage meters"
  on public.workspace_usage_meters for select
  using (public.is_platform_admin());

-- Grants a workspace's permanent free bucket the first time it lands on a
-- paid plan. on conflict do nothing means a later plan change (upgrade or
-- downgrade) never re-grants a second bucket -- it's tied to the workspace
-- once, for good.
create or replace function public.grant_workspace_usage_meters(p_workspace_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_plan record;
begin
  select p.signup_free_emails, p.signup_free_sms, p.signup_free_storage_gb
  into v_plan
  from public.workspace_subscriptions ws
  join public.platform_subscription_plans p on p.id = ws.plan_id
  where ws.workspace_id = p_workspace_id;

  if not found then
    return;
  end if;

  insert into public.workspace_usage_meters (workspace_id, resource_type, free_units_granted)
  values
    (p_workspace_id, 'email', v_plan.signup_free_emails),
    (p_workspace_id, 'sms', v_plan.signup_free_sms),
    (p_workspace_id, 'storage', v_plan.signup_free_storage_gb)
  on conflict (workspace_id, resource_type) do nothing;
end;
$$;

revoke all on function public.grant_workspace_usage_meters(uuid) from public, anon;
grant execute on function public.grant_workspace_usage_meters(uuid) to authenticated, service_role;

-- Manual admin plan assignment now grants the one-time bucket too, matching
-- the Stripe-checkout path (handleSubscriptionCreated calls the same RPC).
create or replace function public.upsert_workspace_subscription(
  p_workspace_id uuid,
  p_plan_id uuid,
  p_stripe_status text default 'active',
  p_seat_count integer default 1
)
returns public.workspace_subscriptions
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_row public.workspace_subscriptions;
begin
  if not public.is_platform_admin() then
    raise exception 'insufficient permissions to manage workspace subscriptions';
  end if;

  insert into public.workspace_subscriptions (workspace_id, plan_id, stripe_status, seat_count)
  values (p_workspace_id, p_plan_id, p_stripe_status, p_seat_count)
  on conflict (workspace_id) do update
    set plan_id = excluded.plan_id,
        stripe_status = excluded.stripe_status,
        seat_count = excluded.seat_count,
        updated_at = now()
  returning * into v_row;

  perform public.grant_workspace_usage_meters(p_workspace_id);

  return v_row;
end;
$$;

-- Computes every actively-paying workspace's NEW overage since the last run.
-- Email/SMS are delta-billed against the lifetime bucket (cumulative
-- all-time usage minus the free grant, minus whatever was already billed).
-- Storage is billed in full each run off the current total, since it's a
-- standing balance, not a depleting one.
create or replace function public.compute_pending_usage_overage()
returns table (
  workspace_id uuid,
  stripe_customer_id text,
  resource_type text,
  new_billable_units numeric,
  amount_cents integer,
  currency text,
  new_billed_units_total numeric
)
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  return query
  with active_ws as (
    select ws.workspace_id, ws.stripe_customer_id, ws.plan_id,
           p.email_overage_rate_cents, p.sms_overage_rate_cents, p.storage_overage_rate_cents,
           p.currency
    from public.workspace_subscriptions ws
    join public.platform_subscription_plans p on p.id = ws.plan_id
    where ws.stripe_status = 'active' and ws.stripe_customer_id is not null
  ),
  email_usage as (
    select w.workspace_id, w.stripe_customer_id, w.currency, w.email_overage_rate_cents,
           m.billed_units_total,
           greatest(0, count(*) filter (where el.status in ('sent', 'delivered')) - m.free_units_granted) as billable_all_time
    from active_ws w
    join public.workspace_usage_meters m on m.workspace_id = w.workspace_id and m.resource_type = 'email'
    left join public.email_log el on el.workspace_id = w.workspace_id
    group by w.workspace_id, w.stripe_customer_id, w.currency, w.email_overage_rate_cents, m.billed_units_total, m.free_units_granted
  ),
  sms_usage as (
    select w.workspace_id, w.stripe_customer_id, w.currency, w.sms_overage_rate_cents,
           m.billed_units_total,
           greatest(0, count(*) filter (where sl.status in ('sent', 'delivered')) - m.free_units_granted) as billable_all_time
    from active_ws w
    join public.workspace_usage_meters m on m.workspace_id = w.workspace_id and m.resource_type = 'sms'
    left join public.sms_log sl on sl.workspace_id = w.workspace_id
    group by w.workspace_id, w.stripe_customer_id, w.currency, w.sms_overage_rate_cents, m.billed_units_total, m.free_units_granted
  ),
  storage_usage as (
    select w.workspace_id, w.stripe_customer_id, w.currency, w.storage_overage_rate_cents,
           greatest(0, coalesce(sum(a.file_size_bytes), 0) / 1073741824.0 - m.free_units_granted) as overage_gb_now
    from active_ws w
    join public.workspace_usage_meters m on m.workspace_id = w.workspace_id and m.resource_type = 'storage'
    left join public.attachments a on a.workspace_id = w.workspace_id and a.is_archived = false
    group by w.workspace_id, w.stripe_customer_id, w.currency, w.storage_overage_rate_cents, m.free_units_granted
  )
  select workspace_id, stripe_customer_id, 'email'::text,
         (billable_all_time - billed_units_total),
         round((billable_all_time - billed_units_total) * email_overage_rate_cents)::integer,
         currency, billable_all_time
  from email_usage
  where billable_all_time > billed_units_total

  union all

  select workspace_id, stripe_customer_id, 'sms'::text,
         (billable_all_time - billed_units_total),
         round((billable_all_time - billed_units_total) * sms_overage_rate_cents)::integer,
         currency, billable_all_time
  from sms_usage
  where billable_all_time > billed_units_total

  union all

  select workspace_id, stripe_customer_id, 'storage'::text,
         overage_gb_now,
         round(overage_gb_now * storage_overage_rate_cents)::integer,
         currency, overage_gb_now
  from storage_usage
  where overage_gb_now > 0;
end;
$$;

revoke all on function public.compute_pending_usage_overage() from public, anon;
grant execute on function public.compute_pending_usage_overage() to service_role;

-- Called only after a Stripe charge for a computed row actually succeeds, so
-- a failed charge is retried next run instead of being silently marked paid.
create or replace function public.record_usage_overage_billed(
  p_workspace_id uuid,
  p_resource_type text,
  p_new_billed_units_total numeric
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  update public.workspace_usage_meters
  set billed_units_total = p_new_billed_units_total, updated_at = now()
  where workspace_id = p_workspace_id and resource_type = p_resource_type;
end;
$$;

revoke all on function public.record_usage_overage_billed(uuid, text, numeric) from public, anon;
grant execute on function public.record_usage_overage_billed(uuid, text, numeric) to service_role;
