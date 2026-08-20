-- Per-user Google/Outlook calendar connections, mirroring user_zoom_connections:
-- each staff member connects their own personal calendar, tokens encrypted
-- the same way (pgp_sym_encrypt via a Vault-stored key, service-role only).
create table public.user_calendar_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('google', 'microsoft')),
  status text not null default 'disconnected' check (status in ('connected', 'disconnected', 'revoked')),
  external_account_email text,
  calendar_id text not null default 'primary',
  access_token_encrypted bytea,
  refresh_token_encrypted bytea,
  token_expires_at timestamptz,
  refresh_token_rotated_at timestamptz,
  connected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider)
);

alter table public.user_calendar_connections enable row level security;

create policy user_calendar_connections_select on public.user_calendar_connections
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Maps a Verexa appointment to the external event it was pushed to, per
-- connection. Deliberately NOT a foreign key to appointments: the sync
-- worker needs to read external_event_id here to delete the far-side event
-- *after* an appointment row is already gone, so this table must outlive
-- an appointments row rather than cascade-delete with it. The worker itself
-- removes the mapping row once the external delete succeeds.
create table public.appointment_external_events (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null,
  user_calendar_connection_id uuid not null references public.user_calendar_connections(id) on delete cascade,
  external_event_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (appointment_id, user_calendar_connection_id)
);
create index appointment_external_events_appointment_id_idx on public.appointment_external_events(appointment_id);

alter table public.appointment_external_events enable row level security;
-- No policies: this is sync-worker bookkeeping, never read by the client directly.

-- Async work queue for pushing appointment changes out to Google/Outlook,
-- drained by /api/cron/sync-calendar-events -- same queue+cron dispatch
-- pattern as notification_queue. Snapshotting the appointment fields here
-- (rather than re-reading appointments at process time) means a 'delete'
-- job still has everything it needs after the source row is gone.
create table public.calendar_sync_queue (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null,
  staff_id uuid not null,
  action text not null check (action in ('upsert', 'delete')),
  title text,
  description text,
  location text,
  meeting_url text,
  start_at timestamptz,
  end_at timestamptz,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  attempts int not null default 0,
  max_attempts int not null default 8,
  error text,
  scheduled_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index calendar_sync_queue_pending_idx on public.calendar_sync_queue(scheduled_at) where status = 'pending';
create index calendar_sync_queue_appointment_id_idx on public.calendar_sync_queue(appointment_id);

alter table public.calendar_sync_queue enable row level security;
-- No policies: written only by the trigger below (security definer) and
-- read only by the service-role cron worker.

create or replace function public.enqueue_calendar_sync()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if tg_op = 'DELETE' then
    if old.staff_id is not null then
      insert into public.calendar_sync_queue (appointment_id, staff_id, action, title, description, location, meeting_url, start_at, end_at)
      values (old.id, old.staff_id, 'delete', old.title, old.description, old.location, old.meeting_url, old.start_at, old.end_at);
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' then
    if new.title is not distinct from old.title
      and new.start_at is not distinct from old.start_at
      and new.end_at is not distinct from old.end_at
      and new.location is not distinct from old.location
      and new.meeting_url is not distinct from old.meeting_url
      and new.description is not distinct from old.description
      and new.status is not distinct from old.status
      and new.staff_id is not distinct from old.staff_id
    then
      return new;
    end if;

    -- Reassigning staff: clean up the old preparer's calendar too, or the
    -- event would sit there forever as a stale ghost meeting.
    if old.staff_id is not null and old.staff_id is distinct from new.staff_id then
      insert into public.calendar_sync_queue (appointment_id, staff_id, action, title, description, location, meeting_url, start_at, end_at)
      values (old.id, old.staff_id, 'delete', old.title, old.description, old.location, old.meeting_url, old.start_at, old.end_at);
    end if;
  end if;

  if new.staff_id is not null then
    insert into public.calendar_sync_queue (appointment_id, staff_id, action, title, description, location, meeting_url, start_at, end_at)
    values (
      new.id, new.staff_id,
      case when new.status = 'cancelled' then 'delete' else 'upsert' end,
      new.title, new.description, new.location, new.meeting_url, new.start_at, new.end_at
    );
  end if;

  return new;
end;
$function$;

create trigger trg_enqueue_calendar_sync
after insert or update or delete on public.appointments
for each row execute function public.enqueue_calendar_sync();

-- Same encrypt/decrypt pattern as Zoom, reusing a separate Vault key so the
-- two integrations can be rotated independently. Locked to service_role,
-- same as encrypt_zoom_secret/decrypt_zoom_secret.
create or replace function public.encrypt_calendar_secret(p_plaintext text)
returns bytea
language sql
security definer
set search_path to 'public', 'extensions'
as $function$
  select case when p_plaintext is null or btrim(p_plaintext) = '' then null
    else pgp_sym_encrypt(p_plaintext, (select decrypted_secret from vault.decrypted_secrets where name = 'calendar_oauth_vault_key'))
  end;
$function$;

create or replace function public.decrypt_calendar_secret(p_ciphertext bytea)
returns text
language sql
security definer
set search_path to 'public', 'extensions'
as $function$
  select case when p_ciphertext is null then null
    else pgp_sym_decrypt(p_ciphertext, (select decrypted_secret from vault.decrypted_secrets where name = 'calendar_oauth_vault_key'))
  end;
$function$;

revoke all on function public.encrypt_calendar_secret(text) from public, anon, authenticated;
revoke all on function public.decrypt_calendar_secret(bytea) from public, anon, authenticated;
grant execute on function public.encrypt_calendar_secret(text) to service_role;
grant execute on function public.decrypt_calendar_secret(bytea) to service_role;

revoke all on public.user_calendar_connections from anon;
revoke all on public.appointment_external_events from anon, authenticated;
revoke all on public.calendar_sync_queue from anon, authenticated;
grant select on public.user_calendar_connections to authenticated;
