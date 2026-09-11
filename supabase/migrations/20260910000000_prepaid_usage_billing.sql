-- Replaces the arrears (bill-after-use) overage model with a strict
-- prepaid one: every workspace on a paid plan draws first from its
-- permanent one-time free bucket, then from a prepaid balance it must
-- purchase in advance. Once both hit zero, sending/uploading is blocked
-- outright -- nothing goes out unpaid. Removes compute_pending_usage_overage
-- and record_usage_overage_billed (the arrears cron's RPCs) and the
-- billed_units_total column they used, since that model no longer runs.

alter table public.workspace_usage_meters
  add column if not exists free_units_consumed numeric not null default 0,
  add column if not exists prepaid_balance numeric not null default 0;

drop function if exists public.compute_pending_usage_overage();
drop function if exists public.record_usage_overage_billed(uuid, text, numeric);

alter table public.workspace_usage_meters drop column if exists billed_units_total;

-- Atomically draws one unit of email/SMS capacity: free bucket first, then
-- prepaid balance. Locks the row so concurrent sends can't both succeed off
-- the same last unit. A workspace with no meter row at all was never
-- granted a paid-plan bucket (unmetered -- e.g. still on trial), so it's
-- allowed through untouched rather than blocked.
create or replace function public.reserve_usage_unit(p_workspace_id uuid, p_resource_type text)
returns table (allowed boolean, source text)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_meter public.workspace_usage_meters%rowtype;
begin
  if p_resource_type not in ('email', 'sms') then
    raise exception 'reserve_usage_unit only applies to email/sms -- storage uses check_storage_capacity';
  end if;

  select * into v_meter
  from public.workspace_usage_meters
  where workspace_id = p_workspace_id and resource_type = p_resource_type
  for update;

  if not found then
    return query select true, null::text;
    return;
  end if;

  if v_meter.free_units_consumed < v_meter.free_units_granted then
    update public.workspace_usage_meters
    set free_units_consumed = free_units_consumed + 1, updated_at = now()
    where id = v_meter.id;
    return query select true, 'free'::text;
    return;
  end if;

  if v_meter.prepaid_balance >= 1 then
    update public.workspace_usage_meters
    set prepaid_balance = prepaid_balance - 1, updated_at = now()
    where id = v_meter.id;
    return query select true, 'prepaid'::text;
    return;
  end if;

  return query select false, null::text;
end;
$$;

revoke all on function public.reserve_usage_unit(uuid, text) from public, anon;
grant execute on function public.reserve_usage_unit(uuid, text) to service_role;

-- Reverses exactly the pool reserve_usage_unit drew from. Called only when
-- the actual vendor send (Resend/Twilio) fails after reservation succeeded,
-- so a failed send never permanently costs the workspace a unit.
create or replace function public.refund_usage_unit(p_workspace_id uuid, p_resource_type text, p_source text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if p_source = 'free' then
    update public.workspace_usage_meters
    set free_units_consumed = greatest(0, free_units_consumed - 1), updated_at = now()
    where workspace_id = p_workspace_id and resource_type = p_resource_type;
  elsif p_source = 'prepaid' then
    update public.workspace_usage_meters
    set prepaid_balance = prepaid_balance + 1, updated_at = now()
    where workspace_id = p_workspace_id and resource_type = p_resource_type;
  end if;
end;
$$;

revoke all on function public.refund_usage_unit(uuid, text, text) from public, anon;
grant execute on function public.refund_usage_unit(uuid, text, text) to service_role;

-- Storage isn't a per-event bucket -- it's a live standing balance, so
-- there's nothing to reserve/refund. This just checks whether current usage
-- plus the file about to be uploaded would exceed the free ceiling plus
-- whatever extra GB has been prepaid. Same "unmetered workspace passes
-- through" rule as reserve_usage_unit.
create or replace function public.check_storage_capacity(p_workspace_id uuid, p_additional_bytes bigint)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_meter record;
  v_current_bytes bigint;
begin
  select free_units_granted, prepaid_balance into v_meter
  from public.workspace_usage_meters
  where workspace_id = p_workspace_id and resource_type = 'storage';

  if not found then
    return true;
  end if;

  select coalesce(sum(file_size_bytes), 0) into v_current_bytes
  from public.attachments
  where workspace_id = p_workspace_id and is_archived = false;

  return (v_current_bytes + coalesce(p_additional_bytes, 0)) <= ((v_meter.free_units_granted + v_meter.prepaid_balance) * 1073741824);
end;
$$;

revoke all on function public.check_storage_capacity(uuid, bigint) from public, anon;
grant execute on function public.check_storage_capacity(uuid, bigint) to authenticated, service_role;

-- Enforces the storage ceiling at the table level (not just the upload API)
-- so it can't be bypassed by a client component inserting directly.
create or replace function public.enforce_storage_capacity()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.check_storage_capacity(new.workspace_id, coalesce(new.file_size_bytes, 0)) then
    raise exception 'storage_limit_exceeded: this workspace has used its included storage and prepaid balance -- purchase a storage top-up to upload more';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_storage_capacity on public.attachments;
create trigger trg_enforce_storage_capacity
  before insert on public.attachments
  for each row execute function public.enforce_storage_capacity();

-- Credits a prepaid top-up purchase onto the balance -- called by the
-- checkout webhook once Stripe confirms payment succeeded, never before.
create or replace function public.credit_prepaid_balance(p_workspace_id uuid, p_resource_type text, p_units numeric)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  insert into public.workspace_usage_meters (workspace_id, resource_type, prepaid_balance)
  values (p_workspace_id, p_resource_type, p_units)
  on conflict (workspace_id, resource_type) do update
    set prepaid_balance = public.workspace_usage_meters.prepaid_balance + excluded.prepaid_balance,
        updated_at = now();
end;
$$;

revoke all on function public.credit_prepaid_balance(uuid, text, numeric) from public, anon;
grant execute on function public.credit_prepaid_balance(uuid, text, numeric) to service_role;
