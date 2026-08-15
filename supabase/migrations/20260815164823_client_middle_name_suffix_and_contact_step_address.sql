-- The new Name field (First/Middle/Last/Suffix) had nowhere on the client
-- record to actually persist a middle name or suffix -- clients only ever
-- had first_name/last_name. Typing one into the Contact step or the portal
-- Basic Info step would have been silently discarded. Adds the two columns
-- so nothing typed there is lost, and threads them through every RPC that
-- already handles first_name/last_name the same way.
alter table public.clients add column if not exists middle_name text;
alter table public.clients add column if not exists suffix text;

-- 1. Client-initiated edits (portal Basic Info / organizer Name field with
--    client_profile_field='full_name') can now propose middle_name/suffix
--    the same way they already propose first_name/last_name.
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

  if p_field not in ('first_name', 'middle_name', 'last_name', 'suffix', 'business_name', 'primary_email', 'primary_phone') then
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

-- 2. Staff approving a queued change needs to recognize the two new columns.
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
  elsif v_row.target_table = 'clients' and v_row.target_column in ('first_name', 'middle_name', 'last_name', 'suffix', 'business_name', 'primary_email', 'primary_phone') then
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

-- 3. Portal Basic Info now collects and proposes middle_name/suffix too.
-- Two new trailing params change the signature, so CREATE OR REPLACE would
-- add a second overload instead of replacing this -- drop the old one first.
drop function if exists public.submit_portal_basic_info(text, text, text, text, text, text, text, text, text);

create or replace function public.submit_portal_basic_info(
  p_first_name text default null,
  p_last_name text default null,
  p_business_name text default null,
  p_primary_email text default null,
  p_primary_phone text default null,
  p_mailing_street text default null,
  p_mailing_city text default null,
  p_mailing_state text default null,
  p_mailing_zip text default null,
  p_middle_name text default null,
  p_suffix text default null
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
  if p_middle_name is not null then perform public.propose_client_contact_field('middle_name', p_middle_name); end if;
  if p_last_name is not null then perform public.propose_client_contact_field('last_name', p_last_name); end if;
  if p_suffix is not null then perform public.propose_client_contact_field('suffix', p_suffix); end if;
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

revoke all on function public.submit_portal_basic_info(text, text, text, text, text, text, text, text, text, text, text) from public, anon;
grant execute on function public.submit_portal_basic_info(text, text, text, text, text, text, text, text, text, text, text) to authenticated;

-- 4. The portal's own snapshot (used for prefill everywhere) now includes
--    the two new columns.
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

  select client_type, first_name, middle_name, last_name, suffix, business_name, primary_email, primary_phone, date_of_birth, portal_basic_info_completed_at
  into v_client from public.clients where id = v_client_id;

  select street, city, state, zip into v_address
  from public.client_addresses
  where client_id = v_client_id and address_type = 'mailing'
  order by is_primary desc, created_at asc
  limit 1;

  return jsonb_build_object(
    'client_type', v_client.client_type,
    'first_name', v_client.first_name,
    'middle_name', v_client.middle_name,
    'last_name', v_client.last_name,
    'suffix', v_client.suffix,
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

-- 5. The public (pre-account) Contact step now also collects middle name,
--    suffix, and a mailing address -- filled in only when currently blank
--    on the resolved client, same "never clobber an existing value without
--    approval" rule the rest of this system already follows. Unlike
--    propose_client_contact_field/_mailing_address (which queue an
--    overwrite for staff approval), there's no portal session yet at this
--    point to attribute a queued change to, and no existing value to
--    protect for a brand-new lead -- so this only ever fills gaps, never
--    proposes replacing something already on file.
-- Six new trailing params change the signature -- drop the old 8-arg
-- overload first so this replaces it instead of adding a duplicate.
drop function if exists public.capture_public_lead_from_contact_step(uuid, text, text, text, text, uuid, uuid, uuid);

create or replace function public.capture_public_lead_from_contact_step(
  p_token uuid,
  p_first_name text,
  p_last_name text,
  p_email text,
  p_phone text,
  p_service_category_id uuid,
  p_service_id uuid,
  p_auth_user_id uuid default null,
  p_middle_name text default null,
  p_suffix text default null,
  p_mailing_street text default null,
  p_mailing_city text default null,
  p_mailing_state text default null,
  p_mailing_zip text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_workspace_id uuid;
  v_client_id uuid;
  v_has_address boolean;
begin
  select ot.workspace_id into v_workspace_id
  from public.organizer_templates ot
  where ot.public_token = p_token and ot.is_public = true and ot.status = 'published';

  if v_workspace_id is null then
    raise exception 'This link is no longer available';
  end if;
  if p_email is null or btrim(p_email) = '' then
    raise exception 'Email is required';
  end if;

  v_client_id := public.find_or_create_public_lead(v_workspace_id, p_first_name, p_last_name, p_email, p_phone);

  update public.clients
  set middle_name = coalesce(middle_name, nullif(btrim(p_middle_name), '')),
      suffix = coalesce(suffix, nullif(btrim(p_suffix), ''))
  where id = v_client_id;

  if p_mailing_street is not null or p_mailing_city is not null or p_mailing_state is not null or p_mailing_zip is not null then
    select exists(select 1 from public.client_addresses where client_id = v_client_id and address_type = 'mailing') into v_has_address;
    if not v_has_address then
      insert into public.client_addresses (client_id, workspace_id, address_type, is_primary, display_order, street, city, state, zip)
      values (v_client_id, v_workspace_id, 'mailing', true, 0, nullif(btrim(p_mailing_street), ''), nullif(btrim(p_mailing_city), ''), nullif(btrim(p_mailing_state), ''), nullif(btrim(p_mailing_zip), ''));
    end if;
  end if;

  insert into public.client_service_interests (client_id, workspace_id, service_category_id, service_id, source)
  values (v_client_id, v_workspace_id, p_service_category_id, p_service_id, 'public_organizer_signup');

  if p_auth_user_id is not null then
    perform public.link_public_portal_account(v_workspace_id, v_client_id, p_auth_user_id, p_email, btrim(coalesce(p_first_name, '') || ' ' || coalesce(p_last_name, '')));
  end if;

  perform public._notify_admins_of_new_public_lead(v_workspace_id, v_client_id);

  return jsonb_build_object('client_id', v_client_id);
end;
$$;

revoke all on function public.capture_public_lead_from_contact_step(uuid, text, text, text, text, uuid, uuid, uuid, text, text, text, text, text, text) from public;
grant execute on function public.capture_public_lead_from_contact_step(uuid, text, text, text, text, uuid, uuid, uuid, text, text, text, text, text, text) to anon, authenticated;

-- 6. propose_client_full_name (added for the Name field type, not yet in
--    any deployed frontend) now handles all four parts instead of just
--    first/last, since middle_name/suffix are real columns now.
drop function if exists public.propose_client_full_name(text, text, uuid, uuid);

create or replace function public.propose_client_full_name(
  p_first_name text,
  p_middle_name text,
  p_last_name text,
  p_suffix text,
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
  v_cur_first text;
  v_cur_middle text;
  v_cur_last text;
  v_cur_suffix text;
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

  select first_name, middle_name, last_name, suffix into v_cur_first, v_cur_middle, v_cur_last, v_cur_suffix
  from public.clients where id = v_client_id;

  v_decision := public._decide_client_field_change(v_workspace_id, v_client_id, 'clients', 'first_name', null, v_cur_first, p_first_name, v_source, p_organizer_response_id, p_organizer_field_id, v_batch, v_portal_user_id);
  if v_decision = 'applied' then update public.clients set first_name = p_first_name, updated_at = now() where id = v_client_id; end if;
  if v_decision = 'queued' then v_any_queued := true; end if;

  v_decision := public._decide_client_field_change(v_workspace_id, v_client_id, 'clients', 'middle_name', null, v_cur_middle, p_middle_name, v_source, p_organizer_response_id, p_organizer_field_id, v_batch, v_portal_user_id);
  if v_decision = 'applied' then update public.clients set middle_name = p_middle_name, updated_at = now() where id = v_client_id; end if;
  if v_decision = 'queued' then v_any_queued := true; end if;

  v_decision := public._decide_client_field_change(v_workspace_id, v_client_id, 'clients', 'last_name', null, v_cur_last, p_last_name, v_source, p_organizer_response_id, p_organizer_field_id, v_batch, v_portal_user_id);
  if v_decision = 'applied' then update public.clients set last_name = p_last_name, updated_at = now() where id = v_client_id; end if;
  if v_decision = 'queued' then v_any_queued := true; end if;

  v_decision := public._decide_client_field_change(v_workspace_id, v_client_id, 'clients', 'suffix', null, v_cur_suffix, p_suffix, v_source, p_organizer_response_id, p_organizer_field_id, v_batch, v_portal_user_id);
  if v_decision = 'applied' then update public.clients set suffix = p_suffix, updated_at = now() where id = v_client_id; end if;
  if v_decision = 'queued' then v_any_queued := true; end if;

  if v_any_queued then
    perform public._notify_admins_of_pending_client_change(v_workspace_id, v_client_id, v_batch);
  end if;
end;
$$;

revoke all on function public.propose_client_full_name(text, text, text, text, uuid, uuid) from public, anon;
grant execute on function public.propose_client_full_name(text, text, text, text, uuid, uuid) to authenticated;
