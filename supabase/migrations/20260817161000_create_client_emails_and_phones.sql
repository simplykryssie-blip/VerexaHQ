-- Reproduces client_emails/client_phones as they already exist live --
-- these tables were created directly against the database by a different,
-- concurrent session, with no corresponding migration file checked in.
-- This migration exists purely so the git migration history stays a
-- faithful, reproducible record of what's actually in the database; the
-- schema below (column names, checks, indexes, RLS, triggers) was read
-- back from the live tables rather than designed fresh.
--
-- Support for multiple emails/phones per client with one primary each,
-- categorized by type. The 20260817181500 migration builds the RPCs,
-- clients.primary_email/primary_phone sync, and pending-change wiring on
-- top of this.

create table public.client_emails (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email_type text not null default 'personal' check (email_type in ('personal', 'business', 'accounting', 'other')),
  email citext not null,
  is_primary boolean not null default false,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.client_phones (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  phone_type text not null default 'mobile' check (phone_type in ('mobile', 'office', 'home', 'fax', 'other')),
  phone_number text not null,
  is_primary boolean not null default false,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index client_emails_one_primary_idx on public.client_emails (client_id) where is_primary;
create index client_emails_client_idx on public.client_emails (client_id, display_order);
create index client_emails_workspace_idx on public.client_emails (workspace_id);

create unique index client_phones_one_primary_idx on public.client_phones (client_id) where is_primary;
create index client_phones_client_idx on public.client_phones (client_id, display_order);
create index client_phones_workspace_idx on public.client_phones (workspace_id);

alter table public.client_emails enable row level security;
alter table public.client_phones enable row level security;

create policy client_emails_select on public.client_emails for select using (is_workspace_member(workspace_id));
create policy client_emails_insert on public.client_emails for insert with check (has_permission(workspace_id, 'clients.edit'));
create policy client_emails_update on public.client_emails for update using (has_permission(workspace_id, 'clients.edit')) with check (has_permission(workspace_id, 'clients.edit'));
create policy client_emails_delete on public.client_emails for delete using (has_permission(workspace_id, 'clients.edit'));

create policy client_phones_select on public.client_phones for select using (is_workspace_member(workspace_id));
create policy client_phones_insert on public.client_phones for insert with check (has_permission(workspace_id, 'clients.edit'));
create policy client_phones_update on public.client_phones for update using (has_permission(workspace_id, 'clients.edit')) with check (has_permission(workspace_id, 'clients.edit'));
create policy client_phones_delete on public.client_phones for delete using (has_permission(workspace_id, 'clients.edit'));

create trigger set_updated_at before update on public.client_emails for each row execute function set_updated_at();
create trigger set_updated_at before update on public.client_phones for each row execute function set_updated_at();

create trigger audit_client_emails after insert or delete or update on public.client_emails for each row execute function audit_trigger_fn();
create trigger audit_client_phones after insert or delete or update on public.client_phones for each row execute function audit_trigger_fn();
