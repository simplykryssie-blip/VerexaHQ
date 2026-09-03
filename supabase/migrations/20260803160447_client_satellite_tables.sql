-- Revision Sprint -- Verexa UX Standard #001 (Progressive Disclosure) backend
-- support.
--
-- clients (built in the prior revision) stores exactly one embedded primary
-- email/phone/address -- there was never a repeating structure to hold a
-- second contact, a seasonal address, or an additional phone. This
-- migration adds the satellite tables the UI needs to render "one primary
-- by default, + Add Another for more" honestly, without touching the
-- existing clients columns (no redesign, no backfill, no data migration
-- risk): clients.primary_email/primary_phone/address_* remain exactly what
-- they were -- the primary slot -- and every table below holds only
-- ADDITIONAL records beyond that primary. Nothing here duplicates a fact
-- clients already stores.

create table public.client_contacts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  first_name text,
  last_name text,
  title text,
  email citext,
  phone text,
  preferred_contact_method text check (preferred_contact_method in ('email', 'phone', 'text', 'mail')),
  is_primary boolean not null default false,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.client_contacts is 'Additional contact people on a client (e.g. spouse, authorized rep, accountant) -- distinct from the client''s own primary_email/primary_phone on public.clients. Progressive disclosure: render zero cards until one is added.';

create unique index client_contacts_one_primary_idx on public.client_contacts (client_id) where is_primary;
create index client_contacts_client_idx on public.client_contacts (client_id, display_order);
create index client_contacts_workspace_idx on public.client_contacts (workspace_id);

create table public.client_addresses (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  address_type text not null default 'mailing' check (address_type in ('mailing', 'business', 'seasonal', 'other')),
  street text,
  city text,
  state text,
  zip text,
  is_primary boolean not null default false,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.client_addresses is 'Additional addresses beyond clients.address_line1/city/state/postal_code (the primary address). Only rendered when they exist.';

create unique index client_addresses_one_primary_idx on public.client_addresses (client_id) where is_primary;
create index client_addresses_client_idx on public.client_addresses (client_id, display_order);
create index client_addresses_workspace_idx on public.client_addresses (workspace_id);

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
comment on table public.client_phones is 'Additional phone numbers beyond clients.primary_phone. Only rendered when they exist.';

create unique index client_phones_one_primary_idx on public.client_phones (client_id) where is_primary;
create index client_phones_client_idx on public.client_phones (client_id, display_order);
create index client_phones_workspace_idx on public.client_phones (workspace_id);

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
comment on table public.client_emails is 'Additional email addresses beyond clients.primary_email. Only rendered when they exist.';

create unique index client_emails_one_primary_idx on public.client_emails (client_id) where is_primary;
create index client_emails_client_idx on public.client_emails (client_id, display_order);
create index client_emails_workspace_idx on public.client_emails (workspace_id);

-- ============================================================================
-- client_relationships: no dedicated "Related Businesses" table -- the UI's
-- Related Businesses section is this same table filtered to
-- business/partner/owner/officer relationship_type (or where
-- related_client.client_type = 'business'), per the "do not introduce
-- duplicate structures" rule.
-- ============================================================================
create table public.client_relationships (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  related_client_id uuid references public.clients(id) on delete set null,
  relationship_type text not null check (relationship_type in (
    'spouse', 'dependent', 'parent', 'child', 'business', 'trust', 'estate', 'partner', 'owner', 'officer', 'other'
  )),
  related_name text,
  notes text,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (related_client_id is not null or related_name is not null)
);
comment on table public.client_relationships is 'A relationship from one client to another (preferred) or to a named person/entity that isn''t itself a client record. The "Related Businesses" UI section is this table filtered to business-ish relationship types -- not a separate table.';

create index client_relationships_client_idx on public.client_relationships (client_id, display_order);
create index client_relationships_related_client_idx on public.client_relationships (related_client_id);
create index client_relationships_workspace_idx on public.client_relationships (workspace_id);

-- ============================================================================
-- client_portal_users: invitation/roster tracking only. Real client-portal
-- authentication is a later phase; this table lets the UI show "one
-- Primary Portal User, + Invite Additional" today without inventing a
-- second auth system.
-- ============================================================================
create table public.client_portal_users (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  invited_email citext not null,
  invited_name text,
  is_primary boolean not null default false,
  status text not null default 'invited' check (status in ('invited', 'active', 'revoked')),
  invited_by uuid references auth.users(id) on delete set null,
  invited_at timestamptz not null default now(),
  accepted_at timestamptz,
  display_order integer not null default 0
);
comment on table public.client_portal_users is 'Client-portal invitation roster. Tracks who has been invited/activated; does not itself grant portal access -- that arrives with client-portal auth in a later phase.';

create unique index client_portal_users_one_primary_idx on public.client_portal_users (client_id) where is_primary;
create index client_portal_users_client_idx on public.client_portal_users (client_id, display_order);
create index client_portal_users_workspace_idx on public.client_portal_users (workspace_id);

create table public.client_notes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  author_id uuid references auth.users(id) on delete set null,
  body text not null,
  is_pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.client_notes is 'Free-form notes on a client. "Recent notes only" is a query-side LIMIT/ORDER BY created_at desc, not a schema constraint.';

create index client_notes_client_idx on public.client_notes (client_id, created_at desc);
create index client_notes_workspace_idx on public.client_notes (workspace_id);

-- ============================================================================
-- Triggers: updated_at + audit on every table above except the append-only
-- client_notes (audited like activity_log/audit_log itself -- no need to
-- audit the auditor).
-- ============================================================================
create trigger set_updated_at before update on public.client_contacts for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.client_addresses for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.client_phones for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.client_emails for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.client_relationships for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.client_notes for each row execute function public.set_updated_at();

create trigger audit_client_contacts after insert or update or delete on public.client_contacts for each row execute function public.audit_trigger_fn();
create trigger audit_client_addresses after insert or update or delete on public.client_addresses for each row execute function public.audit_trigger_fn();
create trigger audit_client_phones after insert or update or delete on public.client_phones for each row execute function public.audit_trigger_fn();
create trigger audit_client_emails after insert or update or delete on public.client_emails for each row execute function public.audit_trigger_fn();
create trigger audit_client_relationships after insert or update or delete on public.client_relationships for each row execute function public.audit_trigger_fn();
create trigger audit_client_portal_users after insert or update or delete on public.client_portal_users for each row execute function public.audit_trigger_fn();

-- ============================================================================
-- RLS: same shape across all seven tables. Reads for any workspace member;
-- writes gated by the existing clients.* / portal.manage permissions --
-- no new permission keys needed. client_notes uses is_workspace_member for
-- insert (collaborative, like activity_log) but author-or-admin for
-- update/delete.
-- ============================================================================
alter table public.client_contacts enable row level security;
alter table public.client_addresses enable row level security;
alter table public.client_phones enable row level security;
alter table public.client_emails enable row level security;
alter table public.client_relationships enable row level security;
alter table public.client_portal_users enable row level security;
alter table public.client_notes enable row level security;

create policy client_contacts_select on public.client_contacts for select using (public.is_workspace_member(workspace_id));
create policy client_contacts_insert on public.client_contacts for insert with check (public.has_permission(workspace_id, 'clients.edit'));
create policy client_contacts_update on public.client_contacts for update using (public.has_permission(workspace_id, 'clients.edit')) with check (public.has_permission(workspace_id, 'clients.edit'));
create policy client_contacts_delete on public.client_contacts for delete using (public.has_permission(workspace_id, 'clients.edit'));

create policy client_addresses_select on public.client_addresses for select using (public.is_workspace_member(workspace_id));
create policy client_addresses_insert on public.client_addresses for insert with check (public.has_permission(workspace_id, 'clients.edit'));
create policy client_addresses_update on public.client_addresses for update using (public.has_permission(workspace_id, 'clients.edit')) with check (public.has_permission(workspace_id, 'clients.edit'));
create policy client_addresses_delete on public.client_addresses for delete using (public.has_permission(workspace_id, 'clients.edit'));

create policy client_phones_select on public.client_phones for select using (public.is_workspace_member(workspace_id));
create policy client_phones_insert on public.client_phones for insert with check (public.has_permission(workspace_id, 'clients.edit'));
create policy client_phones_update on public.client_phones for update using (public.has_permission(workspace_id, 'clients.edit')) with check (public.has_permission(workspace_id, 'clients.edit'));
create policy client_phones_delete on public.client_phones for delete using (public.has_permission(workspace_id, 'clients.edit'));

create policy client_emails_select on public.client_emails for select using (public.is_workspace_member(workspace_id));
create policy client_emails_insert on public.client_emails for insert with check (public.has_permission(workspace_id, 'clients.edit'));
create policy client_emails_update on public.client_emails for update using (public.has_permission(workspace_id, 'clients.edit')) with check (public.has_permission(workspace_id, 'clients.edit'));
create policy client_emails_delete on public.client_emails for delete using (public.has_permission(workspace_id, 'clients.edit'));

create policy client_relationships_select on public.client_relationships for select using (public.is_workspace_member(workspace_id));
create policy client_relationships_insert on public.client_relationships for insert with check (public.has_permission(workspace_id, 'clients.edit'));
create policy client_relationships_update on public.client_relationships for update using (public.has_permission(workspace_id, 'clients.edit')) with check (public.has_permission(workspace_id, 'clients.edit'));
create policy client_relationships_delete on public.client_relationships for delete using (public.has_permission(workspace_id, 'clients.edit'));

create policy client_portal_users_select on public.client_portal_users for select using (public.is_workspace_member(workspace_id));
create policy client_portal_users_insert on public.client_portal_users for insert with check (public.has_permission(workspace_id, 'portal.manage'));
create policy client_portal_users_update on public.client_portal_users for update using (public.has_permission(workspace_id, 'portal.manage')) with check (public.has_permission(workspace_id, 'portal.manage'));
create policy client_portal_users_delete on public.client_portal_users for delete using (public.has_permission(workspace_id, 'portal.manage'));

create policy client_notes_select on public.client_notes for select using (public.is_workspace_member(workspace_id));
create policy client_notes_insert on public.client_notes for insert with check (public.is_workspace_member(workspace_id) and author_id = (select auth.uid()));
create policy client_notes_update on public.client_notes for update using (author_id = (select auth.uid()) or public.is_workspace_admin(workspace_id)) with check (author_id = (select auth.uid()) or public.is_workspace_admin(workspace_id));
create policy client_notes_delete on public.client_notes for delete using (author_id = (select auth.uid()) or public.is_workspace_admin(workspace_id));
