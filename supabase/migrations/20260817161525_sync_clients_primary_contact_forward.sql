-- The previous migration only synced client_emails/client_phones -> clients
-- (a new primary row updates clients.primary_email/primary_phone). Several
-- existing code paths write directly to clients.primary_email/primary_phone
-- without ever touching the new tables: create_client (new client), the
-- portal's "apply immediately, nothing on file yet" shortcut in
-- propose_client_contact_field, and the staff-facing profile edit form
-- (a plain `update clients set ...`). Without the reverse direction, those
-- writes would leave client_emails/client_phones silently out of sync with
-- clients from the moment this shipped.
--
-- These triggers make clients.primary_email/primary_phone the write path
-- that always works (RLS on clients already gates who can use it) and have
-- any such write versioned into the contact tables the same way an
-- explicit add_client_email/add_client_phone call would: old primary
-- demoted to secondary, new value becomes primary. The WHEN clause (value
-- actually changed) also breaks the sync loop with the existing
-- client_emails/client_phones -> clients triggers, since the round-trip
-- update carries the same value it was just set from.

create or replace function public.sync_client_emails_forward()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.primary_email is null then
    return new;
  end if;
  if exists (select 1 from public.client_emails where client_id = new.id and is_primary and email = new.primary_email) then
    return new;
  end if;

  update public.client_emails set is_primary = false where client_id = new.id and is_primary;

  insert into public.client_emails (client_id, workspace_id, email_type, email, is_primary, display_order)
  select new.id, new.workspace_id, 'personal', new.primary_email, true, coalesce((select max(display_order) from public.client_emails where client_id = new.id), -1) + 1;

  return new;
end;
$function$;

-- INSERT and UPDATE are split into separate triggers because a WHEN clause
-- cannot reference OLD for an INSERT event.
create trigger trg_sync_client_emails_forward_ins
after insert on public.clients
for each row when (new.primary_email is not null)
execute function public.sync_client_emails_forward();

create trigger trg_sync_client_emails_forward_upd
after update of primary_email on public.clients
for each row when (new.primary_email is not null and old.primary_email is distinct from new.primary_email)
execute function public.sync_client_emails_forward();

create or replace function public.sync_client_phones_forward()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.primary_phone is null then
    return new;
  end if;
  if exists (select 1 from public.client_phones where client_id = new.id and is_primary and phone_number = new.primary_phone) then
    return new;
  end if;

  update public.client_phones set is_primary = false where client_id = new.id and is_primary;

  insert into public.client_phones (client_id, workspace_id, phone_type, phone_number, is_primary, display_order)
  select new.id, new.workspace_id, 'mobile', new.primary_phone, true, coalesce((select max(display_order) from public.client_phones where client_id = new.id), -1) + 1;

  return new;
end;
$function$;

create trigger trg_sync_client_phones_forward_ins
after insert on public.clients
for each row when (new.primary_phone is not null)
execute function public.sync_client_phones_forward();

create trigger trg_sync_client_phones_forward_upd
after update of primary_phone on public.clients
for each row when (new.primary_phone is not null and old.primary_phone is distinct from new.primary_phone)
execute function public.sync_client_phones_forward();
