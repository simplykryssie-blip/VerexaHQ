-- Generic external-source tracking so any future import (not just GHL) can
-- be safely re-run without duplicating rows. Each of these tables can now
-- record which external system + which of that system's own IDs a row
-- came from; a partial unique index (only when external_id is set) lets
-- the app upsert with "skip if already imported" semantics instead of
-- always inserting blindly, which is what let re-running the GHL notes/
-- tasks/appointments/conversations import duplicate everything.
alter table public.notes add column if not exists external_source text;
alter table public.notes add column if not exists external_id text;
create unique index if not exists notes_external_source_id_idx
  on public.notes (workspace_id, external_source, external_id) where external_id is not null;

alter table public.tasks add column if not exists external_source text;
alter table public.tasks add column if not exists external_id text;
create unique index if not exists tasks_external_source_id_idx
  on public.tasks (workspace_id, external_source, external_id) where external_id is not null;

alter table public.appointments add column if not exists external_source text;
alter table public.appointments add column if not exists external_id text;
create unique index if not exists appointments_external_source_id_idx
  on public.appointments (workspace_id, external_source, external_id) where external_id is not null;

alter table public.message_threads add column if not exists external_source text;
alter table public.message_threads add column if not exists external_id text;
create unique index if not exists message_threads_external_source_id_idx
  on public.message_threads (workspace_id, external_source, external_id) where external_id is not null;

alter table public.messages add column if not exists external_source text;
alter table public.messages add column if not exists external_id text;
create unique index if not exists messages_external_source_id_idx
  on public.messages (workspace_id, external_source, external_id) where external_id is not null;
