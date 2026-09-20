-- ============================================================================
-- MIGRATION RECONCILIATION PHASE 1.7 -- RECOVERED FROM PRODUCTION
--
-- Did not previously exist in Git. Applied directly to production on
-- 2026-09-17 (recorded version 20260917131126, name
-- operational_gate_audit_batch1_crm in
-- supabase_migrations.schema_migrations) without ever being committed here.
-- Reproduced verbatim from schema_migrations.statements. Confidence: A
-- (exact original recovered). Filename uses the real recorded production
-- version so tooling never replays it against this project, while applying
-- correctly on a fresh project.
--
-- Current-state verification (2026-09-20): re-queried pg_proc.prosrc for
-- all 17 functions below directly against production; every one still
-- contains the is_workspace_operational gate added here. Zero drift.
-- ============================================================================

-- P1: workspace-operational-gate audit -- batch 1 (CRM client-record mutations).
create or replace function public.add_client_address(
  p_client_id uuid, p_workspace_id uuid, p_street text, p_city text, p_state text, p_zip text,
  p_make_primary boolean default true, p_address_type text default 'mailing'::text
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_id uuid;
  v_next_order integer;
begin
  if not has_permission(p_workspace_id, 'clients.edit') then
    raise exception 'insufficient permissions to edit this client';
  end if;
  if not public.is_workspace_operational(p_workspace_id) then
    raise exception 'this workspace is not currently operational';
  end if;

  if p_make_primary then
    update public.client_addresses set is_primary = false where client_id = p_client_id and address_type = p_address_type and is_primary;
  end if;

  select coalesce(max(display_order), -1) + 1 into v_next_order
  from public.client_addresses where client_id = p_client_id and address_type = p_address_type;

  insert into public.client_addresses (client_id, workspace_id, address_type, street, city, state, zip, is_primary, display_order)
  values (p_client_id, p_workspace_id, p_address_type, p_street, p_city, p_state, p_zip, p_make_primary, v_next_order)
  returning id into v_id;

  return v_id;
end;
$function$;

create or replace function public.add_client_email(
  p_client_id uuid, p_workspace_id uuid, p_email text, p_make_primary boolean default true, p_email_type text default 'personal'::text
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_id uuid;
  v_next_order integer;
begin
  if not has_permission(p_workspace_id, 'clients.edit') then
    raise exception 'insufficient permissions to edit this client';
  end if;
  if not public.is_workspace_operational(p_workspace_id) then
    raise exception 'this workspace is not currently operational';
  end if;

  if p_make_primary then
    update public.client_emails set is_primary = false where client_id = p_client_id and is_primary;
  end if;

  select coalesce(max(display_order), -1) + 1 into v_next_order from public.client_emails where client_id = p_client_id;

  insert into public.client_emails (client_id, workspace_id, email_type, email, is_primary, display_order)
  values (p_client_id, p_workspace_id, p_email_type, p_email, p_make_primary, v_next_order)
  returning id into v_id;

  return v_id;
end;
$function$;

create or replace function public.add_client_phone(
  p_client_id uuid, p_workspace_id uuid, p_phone text, p_make_primary boolean default true, p_phone_type text default 'mobile'::text
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_id uuid;
  v_next_order integer;
begin
  if not has_permission(p_workspace_id, 'clients.edit') then
    raise exception 'insufficient permissions to edit this client';
  end if;
  if not public.is_workspace_operational(p_workspace_id) then
    raise exception 'this workspace is not currently operational';
  end if;

  if p_make_primary then
    update public.client_phones set is_primary = false where client_id = p_client_id and is_primary;
  end if;

  select coalesce(max(display_order), -1) + 1 into v_next_order from public.client_phones where client_id = p_client_id;

  insert into public.client_phones (client_id, workspace_id, phone_type, phone_number, is_primary, display_order)
  values (p_client_id, p_workspace_id, p_phone_type, p_phone, p_make_primary, v_next_order)
  returning id into v_id;

  return v_id;
end;
$function$;

create or replace function public.delete_client_email(p_email_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_workspace_id uuid;
begin
  select workspace_id into v_workspace_id from public.client_emails where id = p_email_id;
  if v_workspace_id is null then
    raise exception 'email not found';
  end if;
  if not has_permission(v_workspace_id, 'clients.edit') then
    raise exception 'insufficient permissions to edit this client';
  end if;
  if not public.is_workspace_operational(v_workspace_id) then
    raise exception 'this workspace is not currently operational';
  end if;
  delete from public.client_emails where id = p_email_id;
end;
$function$;

create or replace function public.delete_client_phone(p_phone_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_workspace_id uuid;
begin
  select workspace_id into v_workspace_id from public.client_phones where id = p_phone_id;
  if v_workspace_id is null then
    raise exception 'phone not found';
  end if;
  if not has_permission(v_workspace_id, 'clients.edit') then
    raise exception 'insufficient permissions to edit this client';
  end if;
  if not public.is_workspace_operational(v_workspace_id) then
    raise exception 'this workspace is not currently operational';
  end if;
  delete from public.client_phones where id = p_phone_id;
end;
$function$;

create or replace function public.set_client_address_primary(p_address_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_client_id uuid;
  v_workspace_id uuid;
  v_address_type text;
begin
  select client_id, workspace_id, address_type into v_client_id, v_workspace_id, v_address_type from public.client_addresses where id = p_address_id;
  if v_client_id is null then
    raise exception 'address not found';
  end if;
  if not has_permission(v_workspace_id, 'clients.edit') then
    raise exception 'insufficient permissions to edit this client';
  end if;
  if not public.is_workspace_operational(v_workspace_id) then
    raise exception 'this workspace is not currently operational';
  end if;

  update public.client_addresses set is_primary = false where client_id = v_client_id and address_type = v_address_type and is_primary and id <> p_address_id;
  update public.client_addresses set is_primary = true where id = p_address_id;
end;
$function$;

create or replace function public.set_client_email_primary(p_email_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_client_id uuid;
  v_workspace_id uuid;
begin
  select client_id, workspace_id into v_client_id, v_workspace_id from public.client_emails where id = p_email_id;
  if v_client_id is null then
    raise exception 'email not found';
  end if;
  if not has_permission(v_workspace_id, 'clients.edit') then
    raise exception 'insufficient permissions to edit this client';
  end if;
  if not public.is_workspace_operational(v_workspace_id) then
    raise exception 'this workspace is not currently operational';
  end if;

  update public.client_emails set is_primary = false where client_id = v_client_id and is_primary and id <> p_email_id;
  update public.client_emails set is_primary = true where id = p_email_id;
end;
$function$;

create or replace function public.set_client_phone_primary(p_phone_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_client_id uuid;
  v_workspace_id uuid;
begin
  select client_id, workspace_id into v_client_id, v_workspace_id from public.client_phones where id = p_phone_id;
  if v_client_id is null then
    raise exception 'phone not found';
  end if;
  if not has_permission(v_workspace_id, 'clients.edit') then
    raise exception 'insufficient permissions to edit this client';
  end if;
  if not public.is_workspace_operational(v_workspace_id) then
    raise exception 'this workspace is not currently operational';
  end if;

  update public.client_phones set is_primary = false where client_id = v_client_id and is_primary and id <> p_phone_id;
  update public.client_phones set is_primary = true where id = p_phone_id;
end;
$function$;

create or replace function public.mark_client_lost(p_client_id uuid, p_reason text default null::text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_workspace_id uuid;
begin
  select workspace_id into v_workspace_id from public.clients where id = p_client_id;
  if v_workspace_id is null then
    raise exception 'Client not found';
  end if;
  if not public.has_permission(v_workspace_id, 'clients.edit') then
    raise exception 'insufficient permissions';
  end if;
  if not public.is_workspace_operational(v_workspace_id) then
    raise exception 'this workspace is not currently operational';
  end if;

  update public.clients
  set lifecycle_status = 'lost', lost_reason = p_reason, lost_at = now()
  where id = p_client_id;

  update public.engagements
  set status = 'Archived', archived_date = now()
  where client_id = p_client_id
    and status not in ('Completed', 'Archived');

  update public.invoices
  set status = 'void'
  where client_id = p_client_id
    and status not in ('paid', 'void');

  update public.document_requests
  set status = 'cancelled'
  where status = 'open'
    and (
      (entity_type = 'client' and entity_id = p_client_id)
      or (entity_type = 'engagement' and entity_id in (select id from public.engagements where client_id = p_client_id))
    );
end;
$function$;

create or replace function public.merge_clients(p_primary_client_id uuid, p_duplicate_client_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_workspace_id uuid;
  v_dup_workspace_id uuid;
begin
  select workspace_id into v_workspace_id from public.clients where id = p_primary_client_id;
  select workspace_id into v_dup_workspace_id from public.clients where id = p_duplicate_client_id;

  if v_workspace_id is null or v_dup_workspace_id is null then
    raise exception 'client not found';
  end if;
  if v_workspace_id <> v_dup_workspace_id then
    raise exception 'cannot merge clients from different workspaces';
  end if;
  if not public.has_permission(v_workspace_id, 'clients.merge') then
    raise exception 'insufficient permissions to merge clients in this workspace';
  end if;
  if not public.is_workspace_operational(v_workspace_id) then
    raise exception 'this workspace is not currently operational';
  end if;

  update public.clients
  set merged_into_client_id = p_primary_client_id, lifecycle_status = 'archived'
  where id = p_duplicate_client_id;
end;
$function$;

create or replace function public.create_client_relationship(
  p_client_id uuid, p_workspace_id uuid, p_relationship_type text, p_related_name text,
  p_related_client_id uuid default null::uuid, p_related_dob date default null::date,
  p_related_ssn text default null::text, p_custom_relationship_title text default null::text
)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_id uuid;
begin
  if not public.has_permission(p_workspace_id, 'clients.edit') then
    raise exception 'insufficient permissions to add a relationship in this workspace';
  end if;
  if not public.is_workspace_operational(p_workspace_id) then
    raise exception 'this workspace is not currently operational';
  end if;

  insert into public.client_relationships (
    client_id, workspace_id, relationship_type, related_name, related_client_id,
    related_dob, related_ssn_encrypted, related_ssn_last4, custom_relationship_title
  ) values (
    p_client_id, p_workspace_id, p_relationship_type, p_related_name, p_related_client_id,
    p_related_dob, public.encrypt_client_secret(p_related_ssn),
    nullif(right(regexp_replace(coalesce(p_related_ssn, ''), '\D', '', 'g'), 4), ''),
    p_custom_relationship_title
  )
  returning id into v_id;

  return v_id;
end;
$function$;

create or replace function public.record_client_service_interest(p_client_id uuid, p_workspace_id uuid, p_service_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not public.has_permission(p_workspace_id, 'clients.edit') then
    raise exception 'insufficient permissions to record a service interest in this workspace';
  end if;
  if not public.is_workspace_operational(p_workspace_id) then
    raise exception 'this workspace is not currently operational';
  end if;

  if not exists (select 1 from public.clients where id = p_client_id and workspace_id = p_workspace_id) then
    raise exception 'client not found in this workspace';
  end if;

  if exists (
    select 1 from public.client_service_interests
    where client_id = p_client_id and service_id = p_service_id
  ) then
    return;
  end if;

  insert into public.client_service_interests (client_id, workspace_id, service_category_id, service_id, source)
  select p_client_id, p_workspace_id, s.service_category_id, s.id, 'manual'
  from public.services s
  where s.id = p_service_id;
end;
$function$;

create or replace function public.approve_client_pending_change(p_pending_change_id uuid, p_notes text default null::text)
returns void
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_row public.client_pending_changes;
  v_plaintext text;
  v_ssn_hash text;
  v_address_id uuid;
begin
  select * into v_row from public.client_pending_changes where id = p_pending_change_id;
  if v_row.id is null then
    raise exception 'pending change not found';
  end if;
  if not public.has_permission(v_row.workspace_id, 'clients.edit') then
    raise exception 'insufficient permissions';
  end if;
  if not public.is_workspace_operational(v_row.workspace_id) then
    raise exception 'this workspace is not currently operational';
  end if;
  if v_row.status <> 'pending' then
    raise exception 'this change has already been reviewed';
  end if;

  if v_row.target_table = 'clients' and v_row.target_column = 'date_of_birth' then
    update public.clients set date_of_birth = v_row.new_value::date, updated_at = now() where id = v_row.client_id;

  elsif v_row.target_table = 'clients' and v_row.target_column = 'ssn' then
    v_plaintext := public.decrypt_client_secret(decode(v_row.new_value, 'base64'));
    v_ssn_hash := encode(digest(regexp_replace(v_plaintext, '\D', '', 'g') || v_row.workspace_id::text, 'sha256'), 'hex');
    update public.clients
    set ssn_encrypted = decode(v_row.new_value, 'base64'), ssn_hash = v_ssn_hash, ssn_last4 = v_row.new_value_last4, updated_at = now()
    where id = v_row.client_id;

  elsif v_row.target_table = 'clients' and v_row.target_column in ('first_name', 'middle_name', 'last_name', 'suffix', 'business_name') then
    execute format('update public.clients set %I = $1, updated_at = now() where id = $2', v_row.target_column)
      using v_row.new_value, v_row.client_id;

  elsif v_row.target_table = 'clients' and v_row.target_column = 'primary_email' then
    perform public.add_client_email(v_row.client_id, v_row.workspace_id, v_row.new_value, true, 'personal');

  elsif v_row.target_table = 'clients' and v_row.target_column = 'primary_phone' then
    perform public.add_client_phone(v_row.client_id, v_row.workspace_id, v_row.new_value, true, 'mobile');

  elsif v_row.target_table = 'client_addresses' and v_row.target_column in ('street', 'city', 'state', 'zip') then
    select id into v_address_id from public.client_addresses
    where client_id = v_row.client_id and address_type = 'mailing'
      and is_primary and source_batch_id = v_row.batch_id
    limit 1;

    if v_address_id is null then
      v_address_id := public.add_client_address(
        v_row.client_id, v_row.workspace_id,
        case when v_row.target_column = 'street' then v_row.new_value else (select street from public.client_addresses where id = v_row.client_address_id) end,
        case when v_row.target_column = 'city' then v_row.new_value else (select city from public.client_addresses where id = v_row.client_address_id) end,
        case when v_row.target_column = 'state' then v_row.new_value else (select state from public.client_addresses where id = v_row.client_address_id) end,
        case when v_row.target_column = 'zip' then v_row.new_value else (select zip from public.client_addresses where id = v_row.client_address_id) end,
        true, 'mailing'
      );
      update public.client_addresses set source_batch_id = v_row.batch_id where id = v_address_id;
    else
      execute format('update public.client_addresses set %I = $1, updated_at = now() where id = $2', v_row.target_column)
        using v_row.new_value, v_address_id;
    end if;

  else
    raise exception 'unsupported target %/%', v_row.target_table, v_row.target_column;
  end if;

  update public.client_pending_changes
  set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now(), decision_notes = p_notes
  where id = p_pending_change_id;
end;
$function$;

create or replace function public.propose_client_contact_field(
  p_field text, p_new_value text, p_organizer_response_id uuid default null::uuid, p_organizer_field_id uuid default null::uuid
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
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
    if not public.is_workspace_operational(v_workspace_id) then
      raise exception 'this workspace is not currently operational';
    end if;
    execute format('update public.clients set %I = $1, updated_at = now() where id = $2', p_field) using p_new_value, v_client_id;
  elsif v_decision = 'queued' then
    perform public._notify_admins_of_pending_client_change(v_workspace_id, v_client_id, v_batch);
  end if;
end;
$function$;

create or replace function public.propose_client_date_of_birth(
  p_new_value date, p_organizer_response_id uuid default null::uuid, p_organizer_field_id uuid default null::uuid
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
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
    if not public.is_workspace_operational(v_workspace_id) then
      raise exception 'this workspace is not currently operational';
    end if;
    perform set_config('app.bypass_sensitive_field_guard', 'on', true);
    update public.clients set date_of_birth = p_new_value, updated_at = now() where id = v_client_id;
  elsif v_decision = 'queued' then
    perform public._notify_admins_of_pending_client_change(v_workspace_id, v_client_id, v_batch);
  end if;
end;
$function$;

create or replace function public.propose_client_full_name(
  p_first_name text, p_middle_name text, p_last_name text, p_suffix text,
  p_organizer_response_id uuid default null::uuid, p_organizer_field_id uuid default null::uuid
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
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
  if v_decision = 'applied' then
    if not public.is_workspace_operational(v_workspace_id) then raise exception 'this workspace is not currently operational'; end if;
    update public.clients set first_name = p_first_name, updated_at = now() where id = v_client_id;
  end if;
  if v_decision = 'queued' then v_any_queued := true; end if;

  v_decision := public._decide_client_field_change(v_workspace_id, v_client_id, 'clients', 'middle_name', null, v_cur_middle, p_middle_name, v_source, p_organizer_response_id, p_organizer_field_id, v_batch, v_portal_user_id);
  if v_decision = 'applied' then
    if not public.is_workspace_operational(v_workspace_id) then raise exception 'this workspace is not currently operational'; end if;
    update public.clients set middle_name = p_middle_name, updated_at = now() where id = v_client_id;
  end if;
  if v_decision = 'queued' then v_any_queued := true; end if;

  v_decision := public._decide_client_field_change(v_workspace_id, v_client_id, 'clients', 'last_name', null, v_cur_last, p_last_name, v_source, p_organizer_response_id, p_organizer_field_id, v_batch, v_portal_user_id);
  if v_decision = 'applied' then
    if not public.is_workspace_operational(v_workspace_id) then raise exception 'this workspace is not currently operational'; end if;
    update public.clients set last_name = p_last_name, updated_at = now() where id = v_client_id;
  end if;
  if v_decision = 'queued' then v_any_queued := true; end if;

  v_decision := public._decide_client_field_change(v_workspace_id, v_client_id, 'clients', 'suffix', null, v_cur_suffix, p_suffix, v_source, p_organizer_response_id, p_organizer_field_id, v_batch, v_portal_user_id);
  if v_decision = 'applied' then
    if not public.is_workspace_operational(v_workspace_id) then raise exception 'this workspace is not currently operational'; end if;
    update public.clients set suffix = p_suffix, updated_at = now() where id = v_client_id;
  end if;
  if v_decision = 'queued' then v_any_queued := true; end if;

  if v_any_queued then
    perform public._notify_admins_of_pending_client_change(v_workspace_id, v_client_id, v_batch);
  end if;
end;
$function$;

create or replace function public.propose_client_mailing_address(
  p_street text, p_city text, p_state text, p_zip text,
  p_organizer_response_id uuid default null::uuid, p_organizer_field_id uuid default null::uuid
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
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
    if not public.is_workspace_operational(v_workspace_id) then
      raise exception 'this workspace is not currently operational';
    end if;
    insert into public.client_addresses (client_id, workspace_id, address_type, is_primary, display_order)
    values (v_client_id, v_workspace_id, 'mailing', true, 0)
    returning id into v_address_id;
    v_cur_street := null;
    v_cur_city := null;
    v_cur_state := null;
    v_cur_zip := null;
  end if;

  v_decision := public._decide_client_field_change(v_workspace_id, v_client_id, 'client_addresses', 'street', v_address_id, v_cur_street, p_street, v_source, p_organizer_response_id, p_organizer_field_id, v_batch, v_portal_user_id);
  if v_decision = 'applied' then
    if not public.is_workspace_operational(v_workspace_id) then raise exception 'this workspace is not currently operational'; end if;
    update public.client_addresses set street = p_street, updated_at = now() where id = v_address_id;
  end if;
  if v_decision = 'queued' then v_any_queued := true; end if;

  v_decision := public._decide_client_field_change(v_workspace_id, v_client_id, 'client_addresses', 'city', v_address_id, v_cur_city, p_city, v_source, p_organizer_response_id, p_organizer_field_id, v_batch, v_portal_user_id);
  if v_decision = 'applied' then
    if not public.is_workspace_operational(v_workspace_id) then raise exception 'this workspace is not currently operational'; end if;
    update public.client_addresses set city = p_city, updated_at = now() where id = v_address_id;
  end if;
  if v_decision = 'queued' then v_any_queued := true; end if;

  v_decision := public._decide_client_field_change(v_workspace_id, v_client_id, 'client_addresses', 'state', v_address_id, v_cur_state, p_state, v_source, p_organizer_response_id, p_organizer_field_id, v_batch, v_portal_user_id);
  if v_decision = 'applied' then
    if not public.is_workspace_operational(v_workspace_id) then raise exception 'this workspace is not currently operational'; end if;
    update public.client_addresses set state = p_state, updated_at = now() where id = v_address_id;
  end if;
  if v_decision = 'queued' then v_any_queued := true; end if;

  v_decision := public._decide_client_field_change(v_workspace_id, v_client_id, 'client_addresses', 'zip', v_address_id, v_cur_zip, p_zip, v_source, p_organizer_response_id, p_organizer_field_id, v_batch, v_portal_user_id);
  if v_decision = 'applied' then
    if not public.is_workspace_operational(v_workspace_id) then raise exception 'this workspace is not currently operational'; end if;
    update public.client_addresses set zip = p_zip, updated_at = now() where id = v_address_id;
  end if;
  if v_decision = 'queued' then v_any_queued := true; end if;

  if v_any_queued then
    perform public._notify_admins_of_pending_client_change(v_workspace_id, v_client_id, v_batch);
  end if;
end;
$function$;
