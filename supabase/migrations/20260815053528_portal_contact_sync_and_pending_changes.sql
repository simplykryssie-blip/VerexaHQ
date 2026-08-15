-- Portal-sourced client contact info, with staff approval required before
-- overwriting an existing value. See /root/.claude/plans/swirling-crunching-swan.md
-- for full design context.

alter table public.clients
  add column if not exists portal_basic_info_completed_at timestamptz;

alter table public.organizer_fields
  add column if not exists client_profile_field text;

alter table public.organizer_fields
  add constraint organizer_fields_client_profile_field_check
  check (client_profile_field is null or client_profile_field in (
    'first_name', 'last_name', 'business_name', 'primary_email', 'primary_phone', 'mailing_address'
  ));

create table public.client_pending_changes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  source text not null check (source in ('basic_info', 'organizer')),
  organizer_response_id uuid references public.organizer_responses(id) on delete set null,
  organizer_field_id uuid references public.organizer_fields(id) on delete set null,
  target_table text not null check (target_table in ('clients', 'client_addresses')),
  target_column text not null,
  client_address_id uuid references public.client_addresses(id) on delete cascade,
  batch_id uuid not null default gen_random_uuid(),
  old_value text,
  new_value text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  submitted_by_portal_user_id uuid references public.client_portal_users(id) on delete set null,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  decision_notes text,
  created_at timestamptz not null default now()
);

create unique index client_pending_changes_pending_unique
  on public.client_pending_changes (client_id, target_table, target_column, coalesce(client_address_id, '00000000-0000-0000-0000-000000000000'))
  where status = 'pending';

create index client_pending_changes_workspace_status_idx
  on public.client_pending_changes (workspace_id, status);

alter table public.client_pending_changes enable row level security;

create policy client_pending_changes_select
  on public.client_pending_changes for select
  using (public.is_workspace_member(workspace_id));

-- No insert/update/delete policy: every write goes through the SECURITY
-- DEFINER RPCs below, which run as the table owner and bypass RLS.

-- Single decision point: no-op if unchanged/blank submission, apply
-- immediately if the current value is blank, otherwise upsert a pending row
-- (a client re-editing an already-pending field updates that same row
-- rather than piling up duplicates). Private -- only called from the public
-- proposer functions below, which already run as SECURITY DEFINER owner.
create or replace function public._decide_client_field_change(
  p_workspace_id uuid,
  p_client_id uuid,
  p_target_table text,
  p_target_column text,
  p_client_address_id uuid,
  p_current_value text,
  p_new_value text,
  p_source text,
  p_organizer_response_id uuid,
  p_organizer_field_id uuid,
  p_batch_id uuid,
  p_portal_user_id uuid
)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if p_new_value is null or btrim(p_new_value) = '' then
    return 'skipped';
  end if;
  if p_current_value is not distinct from p_new_value then
    return 'skipped';
  end if;
  if p_current_value is null or btrim(p_current_value) = '' then
    return 'applied';
  end if;

  insert into public.client_pending_changes (
    workspace_id, client_id, source, organizer_response_id, organizer_field_id,
    target_table, target_column, client_address_id, batch_id, old_value, new_value, submitted_by_portal_user_id
  ) values (
    p_workspace_id, p_client_id, p_source, p_organizer_response_id, p_organizer_field_id,
    p_target_table, p_target_column, p_client_address_id, p_batch_id, p_current_value, p_new_value, p_portal_user_id
  )
  on conflict (client_id, target_table, target_column, coalesce(client_address_id, '00000000-0000-0000-0000-000000000000'))
    where status = 'pending'
    do update set new_value = excluded.new_value, old_value = excluded.old_value, batch_id = excluded.batch_id, created_at = now();

  return 'queued';
end;
$$;

revoke all on function public._decide_client_field_change(uuid, uuid, text, text, uuid, text, text, text, uuid, uuid, uuid, uuid) from public, anon, authenticated;

create or replace function public._notify_admins_of_pending_client_change(p_workspace_id uuid, p_client_id uuid, p_batch_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_recipient record;
begin
  for v_recipient in
    select wu.user_id from public.workspace_users wu
    join public.roles r on r.id = wu.role_id
    where wu.workspace_id = p_workspace_id and wu.status = 'active'
      and (wu.is_owner or r.slug in ('owner', 'admin'))
  loop
    perform public.create_notification(
      p_workspace_id, v_recipient.user_id, 'CLIENT_PENDING_CHANGE_CREATED',
      'client_pending_change_created', jsonb_build_object('client_id', p_client_id, 'batch_id', p_batch_id),
      array['In-App'::text], 'Medium', 'client', p_client_id
    );
  end loop;
end;
$$;

revoke all on function public._notify_admins_of_pending_client_change(uuid, uuid, uuid) from public, anon, authenticated;

create or replace function public.has_completed_portal_basic_info()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.clients c
    join public.client_portal_users cpu on cpu.client_id = c.id
    where cpu.user_id = auth.uid() and cpu.status = 'active' and c.portal_basic_info_completed_at is not null
  );
$$;

revoke all on function public.has_completed_portal_basic_info() from public, anon;
grant execute on function public.has_completed_portal_basic_info() to authenticated;

create or replace function public.get_portal_client_snapshot()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_client_id uuid;
  v_client record;
  v_address record;
begin
  select client_id into v_client_id from public.client_portal_users where user_id = auth.uid() and status = 'active' limit 1;
  if v_client_id is null then
    raise exception 'no active portal identity for this user';
  end if;

  select client_type, first_name, last_name, business_name, primary_email, primary_phone, portal_basic_info_completed_at
  into v_client from public.clients where id = v_client_id;

  select street, city, state, zip into v_address
  from public.client_addresses
  where client_id = v_client_id and address_type = 'mailing'
  order by is_primary desc, created_at asc
  limit 1;

  return jsonb_build_object(
    'client_type', v_client.client_type,
    'first_name', v_client.first_name,
    'last_name', v_client.last_name,
    'business_name', v_client.business_name,
    'primary_email', v_client.primary_email,
    'primary_phone', v_client.primary_phone,
    'basic_info_completed_at', v_client.portal_basic_info_completed_at,
    'mailing_street', v_address.street,
    'mailing_city', v_address.city,
    'mailing_state', v_address.state,
    'mailing_zip', v_address.zip
  );
end;
$$;

revoke all on function public.get_portal_client_snapshot() from public, anon;
grant execute on function public.get_portal_client_snapshot() to authenticated;

create or replace function public.propose_client_contact_field(
  p_field text,
  p_new_value text,
  p_organizer_response_id uuid default null,
  p_organizer_field_id uuid default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_portal_user_id uuid;
  v_client_id uuid;
  v_workspace_id uuid;
  v_current text;
  v_decision text;
  v_batch uuid := gen_random_uuid();
  v_source text := case when p_organizer_field_id is not null then 'organizer' else 'basic_info' end;
begin
  select cpu.id, cpu.client_id, cpu.workspace_id into v_portal_user_id, v_client_id, v_workspace_id
  from public.client_portal_users cpu where cpu.user_id = auth.uid() and cpu.status = 'active' limit 1;
  if v_client_id is null then
    raise exception 'no active portal identity for this user';
  end if;

  if p_field not in ('first_name', 'last_name', 'business_name', 'primary_email', 'primary_phone') then
    raise exception 'invalid field %', p_field;
  end if;

  execute format('select %I from public.clients where id = $1', p_field) into v_current using v_client_id;

  v_decision := public._decide_client_field_change(
    v_workspace_id, v_client_id, 'clients', p_field, null, v_current, p_new_value,
    v_source, p_organizer_response_id, p_organizer_field_id, v_batch, v_portal_user_id
  );

  if v_decision = 'applied' then
    execute format('update public.clients set %I = $1, updated_at = now() where id = $2', p_field) using p_new_value, v_client_id;
  elsif v_decision = 'queued' then
    perform public._notify_admins_of_pending_client_change(v_workspace_id, v_client_id, v_batch);
  end if;
end;
$$;

revoke all on function public.propose_client_contact_field(text, text, uuid, uuid) from public, anon;
grant execute on function public.propose_client_contact_field(text, text, uuid, uuid) to authenticated;

create or replace function public.propose_client_mailing_address(
  p_street text,
  p_city text,
  p_state text,
  p_zip text,
  p_organizer_response_id uuid default null,
  p_organizer_field_id uuid default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_portal_user_id uuid;
  v_client_id uuid;
  v_workspace_id uuid;
  v_address_id uuid;
  v_cur_street text;
  v_cur_city text;
  v_cur_state text;
  v_cur_zip text;
  v_batch uuid := gen_random_uuid();
  v_source text := case when p_organizer_field_id is not null then 'organizer' else 'basic_info' end;
  v_any_queued boolean := false;
  v_decision text;
begin
  select cpu.id, cpu.client_id, cpu.workspace_id into v_portal_user_id, v_client_id, v_workspace_id
  from public.client_portal_users cpu where cpu.user_id = auth.uid() and cpu.status = 'active' limit 1;
  if v_client_id is null then
    raise exception 'no active portal identity for this user';
  end if;

  select id, street, city, state, zip into v_address_id, v_cur_street, v_cur_city, v_cur_state, v_cur_zip
  from public.client_addresses
  where client_id = v_client_id and address_type = 'mailing'
  order by is_primary desc, created_at asc
  limit 1;

  if v_address_id is null then
    insert into public.client_addresses (client_id, workspace_id, address_type, is_primary, display_order)
    values (v_client_id, v_workspace_id, 'mailing', true, 0)
    returning id into v_address_id;
    v_cur_street := null;
    v_cur_city := null;
    v_cur_state := null;
    v_cur_zip := null;
  end if;

  v_decision := public._decide_client_field_change(v_workspace_id, v_client_id, 'client_addresses', 'street', v_address_id, v_cur_street, p_street, v_source, p_organizer_response_id, p_organizer_field_id, v_batch, v_portal_user_id);
  if v_decision = 'applied' then update public.client_addresses set street = p_street, updated_at = now() where id = v_address_id; end if;
  if v_decision = 'queued' then v_any_queued := true; end if;

  v_decision := public._decide_client_field_change(v_workspace_id, v_client_id, 'client_addresses', 'city', v_address_id, v_cur_city, p_city, v_source, p_organizer_response_id, p_organizer_field_id, v_batch, v_portal_user_id);
  if v_decision = 'applied' then update public.client_addresses set city = p_city, updated_at = now() where id = v_address_id; end if;
  if v_decision = 'queued' then v_any_queued := true; end if;

  v_decision := public._decide_client_field_change(v_workspace_id, v_client_id, 'client_addresses', 'state', v_address_id, v_cur_state, p_state, v_source, p_organizer_response_id, p_organizer_field_id, v_batch, v_portal_user_id);
  if v_decision = 'applied' then update public.client_addresses set state = p_state, updated_at = now() where id = v_address_id; end if;
  if v_decision = 'queued' then v_any_queued := true; end if;

  v_decision := public._decide_client_field_change(v_workspace_id, v_client_id, 'client_addresses', 'zip', v_address_id, v_cur_zip, p_zip, v_source, p_organizer_response_id, p_organizer_field_id, v_batch, v_portal_user_id);
  if v_decision = 'applied' then update public.client_addresses set zip = p_zip, updated_at = now() where id = v_address_id; end if;
  if v_decision = 'queued' then v_any_queued := true; end if;

  if v_any_queued then
    perform public._notify_admins_of_pending_client_change(v_workspace_id, v_client_id, v_batch);
  end if;
end;
$$;

revoke all on function public.propose_client_mailing_address(text, text, text, text, uuid, uuid) from public, anon;
grant execute on function public.propose_client_mailing_address(text, text, text, text, uuid, uuid) to authenticated;

create or replace function public.submit_portal_basic_info(
  p_first_name text default null,
  p_last_name text default null,
  p_business_name text default null,
  p_primary_email text default null,
  p_primary_phone text default null,
  p_mailing_street text default null,
  p_mailing_city text default null,
  p_mailing_state text default null,
  p_mailing_zip text default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_client_id uuid;
begin
  select client_id into v_client_id from public.client_portal_users where user_id = auth.uid() and status = 'active' limit 1;
  if v_client_id is null then
    raise exception 'no active portal identity for this user';
  end if;

  if p_first_name is not null then perform public.propose_client_contact_field('first_name', p_first_name); end if;
  if p_last_name is not null then perform public.propose_client_contact_field('last_name', p_last_name); end if;
  if p_business_name is not null then perform public.propose_client_contact_field('business_name', p_business_name); end if;
  if p_primary_email is not null then perform public.propose_client_contact_field('primary_email', p_primary_email); end if;
  if p_primary_phone is not null then perform public.propose_client_contact_field('primary_phone', p_primary_phone); end if;

  if p_mailing_street is not null or p_mailing_city is not null or p_mailing_state is not null or p_mailing_zip is not null then
    perform public.propose_client_mailing_address(p_mailing_street, p_mailing_city, p_mailing_state, p_mailing_zip);
  end if;

  update public.clients set portal_basic_info_completed_at = coalesce(portal_basic_info_completed_at, now())
  where id = v_client_id;
end;
$$;

revoke all on function public.submit_portal_basic_info(text, text, text, text, text, text, text, text, text) from public, anon;
grant execute on function public.submit_portal_basic_info(text, text, text, text, text, text, text, text, text) to authenticated;

create or replace function public.approve_client_pending_change(p_pending_change_id uuid, p_notes text default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_row public.client_pending_changes;
begin
  select * into v_row from public.client_pending_changes where id = p_pending_change_id;
  if v_row.id is null then
    raise exception 'pending change not found';
  end if;
  if not public.has_permission(v_row.workspace_id, 'clients.edit') then
    raise exception 'insufficient permissions';
  end if;
  if v_row.status <> 'pending' then
    raise exception 'this change has already been reviewed';
  end if;

  if v_row.target_table = 'clients' then
    if v_row.target_column not in ('first_name', 'last_name', 'business_name', 'primary_email', 'primary_phone') then
      raise exception 'unsupported column %', v_row.target_column;
    end if;
    execute format('update public.clients set %I = $1, updated_at = now() where id = $2', v_row.target_column)
      using v_row.new_value, v_row.client_id;
  elsif v_row.target_table = 'client_addresses' then
    if v_row.target_column not in ('street', 'city', 'state', 'zip') then
      raise exception 'unsupported column %', v_row.target_column;
    end if;
    execute format('update public.client_addresses set %I = $1, updated_at = now() where id = $2', v_row.target_column)
      using v_row.new_value, v_row.client_address_id;
  else
    raise exception 'unsupported target_table %', v_row.target_table;
  end if;

  update public.client_pending_changes
  set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now(), decision_notes = p_notes
  where id = p_pending_change_id;
end;
$$;

revoke all on function public.approve_client_pending_change(uuid, text) from public, anon;
grant execute on function public.approve_client_pending_change(uuid, text) to authenticated;

create or replace function public.reject_client_pending_change(p_pending_change_id uuid, p_notes text default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_row public.client_pending_changes;
begin
  select * into v_row from public.client_pending_changes where id = p_pending_change_id;
  if v_row.id is null then
    raise exception 'pending change not found';
  end if;
  if not public.has_permission(v_row.workspace_id, 'clients.edit') then
    raise exception 'insufficient permissions';
  end if;
  if v_row.status <> 'pending' then
    raise exception 'this change has already been reviewed';
  end if;

  update public.client_pending_changes
  set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(), decision_notes = p_notes
  where id = p_pending_change_id;
end;
$$;

revoke all on function public.reject_client_pending_change(uuid, text) from public, anon;
grant execute on function public.reject_client_pending_change(uuid, text) to authenticated;
