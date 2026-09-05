-- Per-workspace phone numbers for the SMS add-on. Every workspace gets its
-- first number free (is_free = true, granted once via
-- provision_phone_number_record, never billed or paused); every number
-- after that costs $4.99/month, billed against the workspace's SMS prepaid
-- balance (converted to SMS-unit-equivalents at the plan's sms_overage_rate_cents,
-- since that's the same balance workspace_usage_meters already tracks for
-- texting -- no separate dollar wallet). A number that can't be paid for is
-- paused (sending/receiving stops) rather than released, so it's never lost
-- and reactivates automatically the moment the balance covers it again.
create table public.workspace_phone_numbers (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  phone_number text not null,
  twilio_sid text,
  is_free boolean not null default false,
  status text not null default 'active' check (status in ('active', 'paused')),
  assigned_client_id uuid references public.clients(id) on delete set null,
  last_billed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (workspace_id, phone_number)
);

alter table public.workspace_phone_numbers enable row level security;

create policy "Workspace members can view their own phone numbers"
  on public.workspace_phone_numbers for select
  using (public.is_workspace_member(workspace_id));

-- All writes go through service-role API routes (Twilio purchase, billing
-- cron), never directly from a client -- same pattern as
-- workspace_usage_meters/credit_prepaid_balance.

-- Inserts a purchased number, marking it the workspace's free one iff it's
-- genuinely the first number this workspace has ever had. Kept server-side
-- (not left to the caller) so a client can't claim a second number free.
create or replace function public.provision_phone_number_record(p_workspace_id uuid, p_phone_number text, p_twilio_sid text)
returns public.workspace_phone_numbers
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_row public.workspace_phone_numbers%rowtype;
  v_has_any boolean;
begin
  select exists(select 1 from public.workspace_phone_numbers where workspace_id = p_workspace_id) into v_has_any;

  insert into public.workspace_phone_numbers (workspace_id, phone_number, twilio_sid, is_free)
  values (p_workspace_id, p_phone_number, p_twilio_sid, not v_has_any)
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.provision_phone_number_record(uuid, text, text) from public, anon;
grant execute on function public.provision_phone_number_record(uuid, text, text) to service_role;

-- Bills every non-free number due this cycle ($4.99, converted to SMS units
-- at the workspace's plan rate) against the workspace's SMS prepaid balance,
-- oldest number first when the balance can't cover all of them. Numbers are
-- "due" once a month (last_billed_at null or 30+ days ago) -- a paused
-- number stays due every run so it reactivates on the very next cron pass
-- (or the immediate retry triggered right after a top-up, see
-- handleUsageTopupCheckoutCompleted) once the balance covers it again.
-- p_workspace_id scopes to one workspace (called right after a top-up);
-- left null it sweeps every workspace (the daily cron).
create or replace function public.bill_and_pause_phone_numbers(p_workspace_id uuid default null)
returns table (workspace_id uuid, phone_number text, result text)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_ws record;
  v_num record;
  v_meter record;
  v_rate_cents integer;
  v_units_needed numeric;
begin
  for v_ws in
    select distinct wpn.workspace_id
    from public.workspace_phone_numbers wpn
    where wpn.is_free = false
      and (wpn.last_billed_at is null or wpn.last_billed_at <= now() - interval '1 month')
      and (p_workspace_id is null or wpn.workspace_id = p_workspace_id)
  loop
    select p.sms_overage_rate_cents into v_rate_cents
    from public.workspace_subscriptions ws
    join public.platform_subscription_plans p on p.id = ws.plan_id
    where ws.workspace_id = v_ws.workspace_id;

    if v_rate_cents is null or v_rate_cents <= 0 then
      continue;
    end if;
    v_units_needed := 499.0 / v_rate_cents;

    select * into v_meter
    from public.workspace_usage_meters
    where workspace_id = v_ws.workspace_id and resource_type = 'sms'
    for update;

    if not found then
      continue;
    end if;

    for v_num in
      select *
      from public.workspace_phone_numbers
      where workspace_id = v_ws.workspace_id
        and is_free = false
        and (last_billed_at is null or last_billed_at <= now() - interval '1 month')
      order by created_at asc
    loop
      if v_meter.prepaid_balance >= v_units_needed then
        update public.workspace_usage_meters
        set prepaid_balance = prepaid_balance - v_units_needed, updated_at = now()
        where id = v_meter.id;
        v_meter.prepaid_balance := v_meter.prepaid_balance - v_units_needed;

        update public.workspace_phone_numbers
        set status = 'active', last_billed_at = now()
        where id = v_num.id;

        workspace_id := v_num.workspace_id;
        phone_number := v_num.phone_number;
        result := 'billed';
        return next;
      else
        update public.workspace_phone_numbers
        set status = 'paused'
        where id = v_num.id;

        workspace_id := v_num.workspace_id;
        phone_number := v_num.phone_number;
        result := 'paused';
        return next;
      end if;
    end loop;
  end loop;
end;
$$;

revoke all on function public.bill_and_pause_phone_numbers(uuid) from public, anon;
grant execute on function public.bill_and_pause_phone_numbers(uuid) to service_role;
