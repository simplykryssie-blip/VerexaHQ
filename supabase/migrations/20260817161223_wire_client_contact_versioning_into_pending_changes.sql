-- client_emails/client_phones already existed live (created by a different
-- session, not yet committed to this repo, hence no migration file for
-- their creation here) with a more complete design than a first draft would
-- have needed: email_type/phone_type categorization, display_order, proper
-- one-primary-per-client indexes, RLS, and audit triggers already in place.
-- This migration only adds what was still missing: syncing the primary row
-- back to clients.primary_email/primary_phone (every existing read site in
-- the app depends on those two columns and shouldn't have to change),
-- backfilling every client's current single email/phone into the new
-- tables, staff-facing add/retag/delete RPCs, and wiring proposed client
-- changes (from the portal) to add a new primary row instead of
-- overwriting -- so the old value survives as a secondary, exactly as
-- before this table existed for the columns that used to be plain
-- overwrites.
--
-- Also adds the SSN/date-of-birth pending-change path: both already
-- refuse any portal-initiated write at the trigger level
-- (guard_client_sensitive_fields requires clients.edit_sensitive, which no
-- portal user can hold), so unlike email/phone/name/address there is no
-- "apply immediately, nothing's on file yet" shortcut for these two --
-- every submission always queues for staff review.

create or replace function public.sync_client_primary_email()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.is_primary then
    update public.clients
    set primary_email = new.email, normalized_email = lower(btrim(new.email::text))::citext, updated_at = now()
    where id = new.client_id;
  end if;
  return new;
end;
$function$;

create trigger trg_sync_client_primary_email
after insert or update of is_primary, email on public.client_emails
for each row when (new.is_primary)
execute function public.sync_client_primary_email();

create or replace function public.sync_client_primary_phone()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.is_primary then
    update public.clients
    set primary_phone = new.phone_number, normalized_phone = nullif(regexp_replace(coalesce(new.phone_number, ''), '\D', '', 'g'), ''), updated_at = now()
    where id = new.client_id;
  end if;
  return new;
end;
$function$;

create trigger trg_sync_client_primary_phone
after insert or update of is_primary, phone_number on public.client_phones
for each row when (new.is_primary)
execute function public.sync_client_primary_phone();

-- Backfill: every client's existing single email/phone becomes its first,
-- primary row in the new tables -- no data lost, nothing changes for any
-- existing read of clients.primary_email/primary_phone. Guarded by a
-- not-exists check since this migration may run against a database where
-- another session has already begun its own backfill.
insert into public.client_emails (client_id, workspace_id, email_type, email, is_primary, display_order)
select c.id, c.workspace_id, 'personal', c.primary_email, true, 0
from public.clients c
where c.primary_email is not null
  and not exists (select 1 from public.client_emails ce where ce.client_id = c.id);

insert into public.client_phones (client_id, workspace_id, phone_type, phone_number, is_primary, display_order)
select c.id, c.workspace_id, 'mobile', c.primary_phone, true, 0
from public.clients c
where c.primary_phone is not null
  and not exists (select 1 from public.client_phones cp where cp.client_id = c.id);

create or replace function public.add_client_email(p_client_id uuid, p_workspace_id uuid, p_email text, p_make_primary boolean default true, p_email_type text default 'personal')
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

create or replace function public.add_client_phone(p_client_id uuid, p_workspace_id uuid, p_phone text, p_make_primary boolean default true, p_phone_type text default 'mobile')
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

  update public.client_phones set is_primary = false where client_id = v_client_id and is_primary and id <> p_phone_id;
  update public.client_phones set is_primary = true where id = p_phone_id;
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
  delete from public.client_phones where id = p_phone_id;
end;
$function$;

-- Same idea for mailing addresses, which already had multi-row + is_primary
-- support in client_addresses -- approving a proposed change now adds a
-- new primary row and demotes the old one instead of overwriting it.
create or replace function public.add_client_address(p_client_id uuid, p_workspace_id uuid, p_street text, p_city text, p_state text, p_zip text, p_make_primary boolean default true, p_address_type text default 'mailing')
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

  update public.client_addresses set is_primary = false where client_id = v_client_id and address_type = v_address_type and is_primary and id <> p_address_id;
  update public.client_addresses set is_primary = true where id = p_address_id;
end;
$function$;

-- Pending-change review needs a way to show "ending in 1234" for a proposed
-- SSN without ever storing the real number in plain text. This holds that
-- display-only last-4; the actual proposed value sits encrypted in new_value.
alter table public.client_pending_changes add column if not exists new_value_last4 text;

-- Marks which pending-change batch created a given address row, so
-- approving several column changes from the same submission (street, then
-- city, then zip) updates the one new row that batch already created
-- instead of creating a duplicate for every column.
alter table public.client_addresses add column if not exists source_batch_id uuid;

create or replace function public.propose_client_sensitive_field(p_field text, p_new_value text, p_organizer_response_id uuid default null, p_organizer_field_id uuid default null)
returns void
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_portal_user_id uuid;
  v_client_id uuid;
  v_workspace_id uuid;
  v_batch uuid := gen_random_uuid();
  v_source text := case when p_organizer_field_id is not null then 'organizer' else 'basic_info' end;
  v_stored_value text;
  v_last4 text;
  v_old_last4 text;
begin
  select cpu.id, cpu.client_id, cpu.workspace_id into v_portal_user_id, v_client_id, v_workspace_id
  from public.client_portal_users cpu where cpu.user_id = auth.uid() and cpu.status = 'active' limit 1;
  if v_client_id is null then
    raise exception 'no active portal identity for this user';
  end if;

  if p_field not in ('date_of_birth', 'ssn') then
    raise exception 'invalid field %', p_field;
  end if;
  if p_new_value is null or btrim(p_new_value) = '' then
    return;
  end if;

  if p_field = 'ssn' then
    v_stored_value := encode(public.encrypt_client_secret(p_new_value), 'base64');
    v_last4 := nullif(right(regexp_replace(p_new_value, '\D', '', 'g'), 4), '');
    select ssn_last4 into v_old_last4 from public.clients where id = v_client_id;
  else
    v_stored_value := p_new_value;
    v_last4 := null;
    select date_of_birth::text into v_old_last4 from public.clients where id = v_client_id;
  end if;

  insert into public.client_pending_changes (
    workspace_id, client_id, source, organizer_response_id, organizer_field_id,
    target_table, target_column, old_value, new_value, new_value_last4, batch_id, submitted_by_portal_user_id
  ) values (
    v_workspace_id, v_client_id, v_source, p_organizer_response_id, p_organizer_field_id,
    'clients', p_field, v_old_last4, v_stored_value, v_last4, v_batch, v_portal_user_id
  )
  on conflict (client_id, target_table, target_column, coalesce(client_address_id, '00000000-0000-0000-0000-000000000000'))
    where status = 'pending'
    do update set new_value = excluded.new_value, new_value_last4 = excluded.new_value_last4, old_value = excluded.old_value, batch_id = excluded.batch_id, created_at = now();

  perform public._notify_admins_of_pending_client_change(v_workspace_id, v_client_id, v_batch);
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
    -- All four columns for one address change arrive as separate pending
    -- rows sharing a batch_id; only the first one approved for this address
    -- should create the new row, the rest just contribute their column.
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
