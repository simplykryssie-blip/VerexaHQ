alter table public.organizer_fields drop constraint organizer_fields_client_profile_field_check;
alter table public.organizer_fields
  add constraint organizer_fields_client_profile_field_check
  check (client_profile_field is null or client_profile_field in (
    'first_name', 'last_name', 'business_name', 'primary_email', 'primary_phone', 'mailing_address', 'date_of_birth'
  ));

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

  select client_type, first_name, last_name, business_name, primary_email, primary_phone, date_of_birth, portal_basic_info_completed_at
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
    'date_of_birth', v_client.date_of_birth,
    'basic_info_completed_at', v_client.portal_basic_info_completed_at,
    'mailing_street', v_address.street,
    'mailing_city', v_address.city,
    'mailing_state', v_address.state,
    'mailing_zip', v_address.zip
  );
end;
$$;

create or replace function public.propose_client_date_of_birth(
  p_new_value date,
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
  v_current date;
  v_decision text;
  v_batch uuid := gen_random_uuid();
  v_source text := case when p_organizer_field_id is not null then 'organizer' else 'basic_info' end;
begin
  select cpu.id, cpu.client_id, cpu.workspace_id into v_portal_user_id, v_client_id, v_workspace_id
  from public.client_portal_users cpu where cpu.user_id = auth.uid() and cpu.status = 'active' limit 1;
  if v_client_id is null then
    raise exception 'no active portal identity for this user';
  end if;

  select date_of_birth into v_current from public.clients where id = v_client_id;

  v_decision := public._decide_client_field_change(
    v_workspace_id, v_client_id, 'clients', 'date_of_birth', null, v_current::text, p_new_value::text,
    v_source, p_organizer_response_id, p_organizer_field_id, v_batch, v_portal_user_id
  );

  if v_decision = 'applied' then
    update public.clients set date_of_birth = p_new_value, updated_at = now() where id = v_client_id;
  elsif v_decision = 'queued' then
    perform public._notify_admins_of_pending_client_change(v_workspace_id, v_client_id, v_batch);
  end if;
end;
$$;

revoke all on function public.propose_client_date_of_birth(date, uuid, uuid) from public, anon;
grant execute on function public.propose_client_date_of_birth(date, uuid, uuid) to authenticated;

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

  if v_row.target_table = 'clients' and v_row.target_column = 'date_of_birth' then
    update public.clients set date_of_birth = v_row.new_value::date, updated_at = now() where id = v_row.client_id;
  elsif v_row.target_table = 'clients' and v_row.target_column in ('first_name', 'last_name', 'business_name', 'primary_email', 'primary_phone') then
    execute format('update public.clients set %I = $1, updated_at = now() where id = $2', v_row.target_column)
      using v_row.new_value, v_row.client_id;
  elsif v_row.target_table = 'client_addresses' and v_row.target_column in ('street', 'city', 'state', 'zip') then
    execute format('update public.client_addresses set %I = $1, updated_at = now() where id = $2', v_row.target_column)
      using v_row.new_value, v_row.client_address_id;
  else
    raise exception 'unsupported target %/%', v_row.target_table, v_row.target_column;
  end if;

  update public.client_pending_changes
  set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now(), decision_notes = p_notes
  where id = p_pending_change_id;
end;
$$;
