-- Contact Sharing Phase 1: schema for Independent PTIN -> ERO Contact
-- sharing. Eleven new tables, one existing-table CHECK extension
-- (attachments.entity_type), and three new permission keys.
--
-- This migration creates schema and RLS only -- no RPCs yet (Phase 2) and
-- no application code references any of this yet, so this is safe to
-- apply on its own. Every new table has RLS enabled with SELECT-only
-- policies; there are no INSERT/UPDATE/DELETE policies anywhere in this
-- migration, by design -- all writes happen exclusively through the
-- SECURITY DEFINER RPCs added in Phase 2.
--
-- Source-side identifiers (source_workspace_id, source_client_id,
-- source_attachment_id) are plain uuid columns with NO foreign key,
-- matching the existing, live clients.source_workspace_id precedent
-- (used by copy_shared_engagement) -- a future Contact hard-delete
-- feature must never be blocked by, or cascade into, this feature's
-- retained history. Destination-side identifiers and firm_connection_id
-- (a table whose rows are never hard-deleted, only status-flipped) use
-- real foreign keys.

-- ============================================================
-- 1. contact_shares -- request/approval/transfer envelope
-- ============================================================
create table public.contact_shares (
  id uuid primary key default gen_random_uuid(),
  source_workspace_id uuid not null,
  source_client_id uuid not null,
  destination_workspace_id uuid not null references public.workspaces(id) on delete cascade,
  firm_connection_id uuid not null references public.firm_connections(id) on delete no action,
  initiated_by text not null check (initiated_by in ('source', 'destination')),
  initiated_by_user_id uuid references auth.users(id) on delete set null,
  status text not null default 'pending' check (status in (
    'pending', 'approved', 'corrections_requested', 'rejected',
    'withdrawn', 'expired', 'transferred', 'completed_no_change'
  )),
  transfer_kind text not null check (transfer_kind in ('initial', 'update')),
  reviewer_id uuid references auth.users(id) on delete set null,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamp with time zone,
  decision_notes text,
  expires_at timestamp with time zone,
  resulting_version_id uuid,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

-- One in-flight share at a time for a given source Contact -> destination
-- ERO pair -- the idempotency guard for double-clicked/duplicate share and
-- update-request creation. Workspace identity is included explicitly
-- (not just source_client_id, which is already globally unique as a
-- uuid) so the constraint reads unambiguously and matches the locked
-- architecture spec exactly.
create unique index contact_shares_one_in_flight_idx
  on public.contact_shares (source_client_id, destination_workspace_id)
  where status in ('pending', 'corrections_requested');

create index contact_shares_destination_idx on public.contact_shares (destination_workspace_id, status);
create index contact_shares_source_idx on public.contact_shares (source_workspace_id, status);
create index contact_shares_firm_connection_idx on public.contact_shares (firm_connection_id);

create trigger set_updated_at before update on public.contact_shares
  for each row execute function public.set_updated_at();

-- ============================================================
-- 2. contact_share_categories -- normalized category selection
-- ============================================================
create table public.contact_share_categories (
  contact_share_id uuid not null references public.contact_shares(id) on delete no action,
  category_key text not null check (category_key in (
    'IDENTIFYING_INFO', 'PHONE', 'EMAIL', 'ADDRESS', 'SERVICE_INTERESTS', 'DOCUMENTS'
  )),
  primary key (contact_share_id, category_key)
);

-- ============================================================
-- 3. contact_share_actions -- append-only audit trail
-- ============================================================
create table public.contact_share_actions (
  id uuid primary key default gen_random_uuid(),
  contact_share_id uuid not null references public.contact_shares(id) on delete no action,
  action text not null,
  actor_id uuid references auth.users(id) on delete set null,
  comment text,
  created_at timestamp with time zone not null default now()
);

create index contact_share_actions_share_idx on public.contact_share_actions (contact_share_id);

-- ============================================================
-- 4. ero_retained_contacts -- destination-owned durable retained Contact
-- ============================================================
create table public.ero_retained_contacts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  source_workspace_id uuid not null,
  source_client_id uuid not null,
  source_deleted_at timestamp with time zone,
  current_firm_connection_id uuid references public.firm_connections(id) on delete no action,
  status text not null default 'active' check (status in ('active', 'connection_ended')),
  current_version_id uuid,
  first_transferred_at timestamp with time zone,
  last_updated_at timestamp with time zone,
  -- IDENTIFYING_INFO fields folded onto the header (1:1, not a child table)
  first_name text,
  middle_name text,
  last_name text,
  suffix text,
  preferred_name text,
  client_type text,
  business_name text,
  date_of_birth date,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  unique (workspace_id, source_workspace_id, source_client_id)
);

create index ero_retained_contacts_source_idx on public.ero_retained_contacts (source_workspace_id, source_client_id);
create index ero_retained_contacts_connection_idx on public.ero_retained_contacts (current_firm_connection_id);

create trigger set_updated_at before update on public.ero_retained_contacts
  for each row execute function public.set_updated_at();

-- ============================================================
-- 5-8. Current-state child tables -- typed, operational read path,
-- mirroring client_phones/client_emails/client_addresses/
-- client_service_interests' own shape. Mutated only by
-- execute_contact_share_transfer(); never hand-edited.
-- ============================================================
create table public.ero_retained_contact_phones (
  id uuid primary key default gen_random_uuid(),
  retained_contact_id uuid not null references public.ero_retained_contacts(id) on delete cascade,
  phone_number text not null,
  phone_type text,
  is_primary boolean not null default false,
  display_order integer not null default 0,
  created_at timestamp with time zone not null default now()
);
create index ero_retained_contact_phones_retained_idx on public.ero_retained_contact_phones (retained_contact_id);

create table public.ero_retained_contact_emails (
  id uuid primary key default gen_random_uuid(),
  retained_contact_id uuid not null references public.ero_retained_contacts(id) on delete cascade,
  email text not null,
  email_type text,
  is_primary boolean not null default false,
  display_order integer not null default 0,
  created_at timestamp with time zone not null default now()
);
create index ero_retained_contact_emails_retained_idx on public.ero_retained_contact_emails (retained_contact_id);

create table public.ero_retained_contact_addresses (
  id uuid primary key default gen_random_uuid(),
  retained_contact_id uuid not null references public.ero_retained_contacts(id) on delete cascade,
  address_type text,
  street text,
  street2 text,
  city text,
  state text,
  zip text,
  is_primary boolean not null default false,
  display_order integer not null default 0,
  created_at timestamp with time zone not null default now()
);
create index ero_retained_contact_addresses_retained_idx on public.ero_retained_contact_addresses (retained_contact_id);
-- Mirrors the same single-global-primary invariant client_addresses
-- already enforces (Contacts Pass 2).
create unique index ero_retained_contact_addresses_one_primary_idx
  on public.ero_retained_contact_addresses (retained_contact_id)
  where is_primary;

-- service_category_id/service_id on the source side are catalog rows
-- private to the source workspace -- meaningless (and unresolvable) as
-- foreign keys in the destination workspace, exactly the same reasoning
-- that keeps source_client_id FK-less. Resolved display text is stored
-- instead, not the source catalog's ids.
create table public.ero_retained_contact_service_interests (
  id uuid primary key default gen_random_uuid(),
  retained_contact_id uuid not null references public.ero_retained_contacts(id) on delete cascade,
  service_category_name text,
  service_name text,
  created_at timestamp with time zone not null default now()
);
create index ero_retained_contact_service_interests_retained_idx on public.ero_retained_contact_service_interests (retained_contact_id);

-- ============================================================
-- 9. ero_retained_contact_versions -- immutable version header
-- ============================================================
create table public.ero_retained_contact_versions (
  id uuid primary key default gen_random_uuid(),
  retained_contact_id uuid not null references public.ero_retained_contacts(id) on delete cascade,
  contact_share_id uuid not null references public.contact_shares(id) on delete no action,
  version_number integer not null,
  transfer_kind text not null check (transfer_kind in ('initial', 'update')),
  is_current boolean not null default true,
  created_at timestamp with time zone not null default now(),
  unique (contact_share_id),
  unique (retained_contact_id, version_number)
);

create index ero_retained_contact_versions_retained_idx on public.ero_retained_contact_versions (retained_contact_id);
-- Exactly one current version per retained Contact.
create unique index ero_retained_contact_versions_one_current_idx
  on public.ero_retained_contact_versions (retained_contact_id)
  where is_current;

-- ero_retained_contacts.current_version_id / contact_shares.resulting_version_id
-- are added as plain columns above (not FK'd at creation time, since
-- ero_retained_contact_versions didn't exist yet) -- add the FKs now.
alter table public.ero_retained_contacts
  add constraint ero_retained_contacts_current_version_id_fkey
  foreign key (current_version_id) references public.ero_retained_contact_versions(id) on delete no action;

alter table public.contact_shares
  add constraint contact_shares_resulting_version_id_fkey
  foreign key (resulting_version_id) references public.ero_retained_contact_versions(id) on delete no action;

-- ============================================================
-- 10. ero_retained_contact_version_fields -- full point-in-time snapshot
-- ============================================================
-- NOT a diff table. Every field, once it first enters scope, is carried
-- forward into every later version (including unchanged values) so any
-- single version_id independently reconstructs the complete retained
-- state at that point in time with a direct, non-recursive query --
-- never by replaying a diff chain. value permits NULL: an explicit NULL
-- row means "confirmed empty at this transfer", not "not tracked".
create table public.ero_retained_contact_version_fields (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.ero_retained_contact_versions(id) on delete cascade,
  category_key text not null check (category_key in (
    'IDENTIFYING_INFO', 'PHONE', 'EMAIL', 'ADDRESS', 'SERVICE_INTERESTS', 'DOCUMENTS'
  )),
  field_name text not null,
  value text,
  created_at timestamp with time zone not null default now()
);

create index ero_retained_contact_version_fields_version_idx on public.ero_retained_contact_version_fields (version_id);

-- ============================================================
-- 11. contact_document_transfers -- document mapping/audit
-- ============================================================
create table public.contact_document_transfers (
  id uuid primary key default gen_random_uuid(),
  contact_share_id uuid not null references public.contact_shares(id) on delete no action,
  version_id uuid references public.ero_retained_contact_versions(id) on delete cascade,
  source_attachment_id uuid not null,
  destination_attachment_id uuid not null references public.attachments(id) on delete cascade,
  source_storage_path text not null,
  destination_storage_path text not null,
  replaces_destination_attachment_id uuid references public.attachments(id) on delete set null,
  transferred_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  unique (contact_share_id, source_attachment_id)
);

create index contact_document_transfers_share_idx on public.contact_document_transfers (contact_share_id);
create index contact_document_transfers_pending_idx on public.contact_document_transfers (destination_attachment_id) where transferred_at is null;

-- ============================================================
-- Existing-table changes
-- ============================================================

-- attachments.entity_type -- extend the existing CHECK, same pattern
-- already used once before to add 'firm_connection'.
alter table public.attachments drop constraint attachments_entity_type_check;
alter table public.attachments add constraint attachments_entity_type_check
  check (entity_type = any (array['client', 'engagement', 'workflow', 'task', 'invoice', 'document', 'blueprint', 'message', 'note', 'firm_connection', 'ero_retained_contact']));

-- permissions -- three new keys, granted to the same system roles that
-- already hold engagements.share/engagements.approve_review (owner,
-- admin, ero get both share-side permissions; reviewer gets
-- approve/request-update only, not share -- mirroring that existing
-- grant pattern exactly rather than inventing a new one).
insert into public.permissions (key, category, description) values
  ('clients.share', 'clients', 'Share a Contact''s information with the workspace''s connected ERO'),
  ('clients.approve_share', 'clients', 'Approve, reject, or request corrections on a Contact share or update request'),
  ('clients.request_share_update', 'clients', 'Request an updated copy of a previously-shared Contact''s information')
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p
where r.is_system_role and r.slug in ('owner', 'admin', 'ero')
  and p.key in ('clients.share', 'clients.approve_share', 'clients.request_share_update')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p
where r.is_system_role and r.slug in ('reviewer')
  and p.key in ('clients.approve_share', 'clients.request_share_update')
on conflict do nothing;

-- ============================================================
-- RLS -- every new table, SELECT-only. No INSERT/UPDATE/DELETE policy
-- anywhere in this migration: every write happens exclusively through
-- the SECURITY DEFINER RPCs added in Phase 2.
-- ============================================================
alter table public.contact_shares enable row level security;
alter table public.contact_share_categories enable row level security;
alter table public.contact_share_actions enable row level security;
alter table public.ero_retained_contacts enable row level security;
alter table public.ero_retained_contact_phones enable row level security;
alter table public.ero_retained_contact_emails enable row level security;
alter table public.ero_retained_contact_addresses enable row level security;
alter table public.ero_retained_contact_service_interests enable row level security;
alter table public.ero_retained_contact_versions enable row level security;
alter table public.ero_retained_contact_version_fields enable row level security;
alter table public.contact_document_transfers enable row level security;

create policy contact_shares_select on public.contact_shares for select using (
  public.is_workspace_member(source_workspace_id) or public.is_workspace_member(destination_workspace_id)
);

create policy contact_share_categories_select on public.contact_share_categories for select using (
  exists (
    select 1 from public.contact_shares cs
    where cs.id = contact_share_categories.contact_share_id
      and (public.is_workspace_member(cs.source_workspace_id) or public.is_workspace_member(cs.destination_workspace_id))
  )
);

create policy contact_share_actions_select on public.contact_share_actions for select using (
  exists (
    select 1 from public.contact_shares cs
    where cs.id = contact_share_actions.contact_share_id
      and (public.is_workspace_member(cs.source_workspace_id) or public.is_workspace_member(cs.destination_workspace_id))
  )
);

-- Deliberately unconditional on connection status: reading the ERO's own
-- already-transferred, destination-owned retained data is not "live
-- source Contact access" (never granted, active or ended) -- it is the
-- ERO's own historical filing/review record, which must remain readable
-- after disconnect per the locked requirements. See migration comment
-- above and the architecture design docs for the full reasoning.
create policy ero_retained_contacts_select on public.ero_retained_contacts for select using (
  public.is_workspace_member(workspace_id) or public.is_workspace_member(source_workspace_id)
);

create policy ero_retained_contact_phones_select on public.ero_retained_contact_phones for select using (
  exists (
    select 1 from public.ero_retained_contacts rc
    where rc.id = ero_retained_contact_phones.retained_contact_id
      and (public.is_workspace_member(rc.workspace_id) or public.is_workspace_member(rc.source_workspace_id))
  )
);

create policy ero_retained_contact_emails_select on public.ero_retained_contact_emails for select using (
  exists (
    select 1 from public.ero_retained_contacts rc
    where rc.id = ero_retained_contact_emails.retained_contact_id
      and (public.is_workspace_member(rc.workspace_id) or public.is_workspace_member(rc.source_workspace_id))
  )
);

create policy ero_retained_contact_addresses_select on public.ero_retained_contact_addresses for select using (
  exists (
    select 1 from public.ero_retained_contacts rc
    where rc.id = ero_retained_contact_addresses.retained_contact_id
      and (public.is_workspace_member(rc.workspace_id) or public.is_workspace_member(rc.source_workspace_id))
  )
);

create policy ero_retained_contact_service_interests_select on public.ero_retained_contact_service_interests for select using (
  exists (
    select 1 from public.ero_retained_contacts rc
    where rc.id = ero_retained_contact_service_interests.retained_contact_id
      and (public.is_workspace_member(rc.workspace_id) or public.is_workspace_member(rc.source_workspace_id))
  )
);

create policy ero_retained_contact_versions_select on public.ero_retained_contact_versions for select using (
  exists (
    select 1 from public.ero_retained_contacts rc
    where rc.id = ero_retained_contact_versions.retained_contact_id
      and (public.is_workspace_member(rc.workspace_id) or public.is_workspace_member(rc.source_workspace_id))
  )
);

create policy ero_retained_contact_version_fields_select on public.ero_retained_contact_version_fields for select using (
  exists (
    select 1 from public.ero_retained_contact_versions v
    join public.ero_retained_contacts rc on rc.id = v.retained_contact_id
    where v.id = ero_retained_contact_version_fields.version_id
      and (public.is_workspace_member(rc.workspace_id) or public.is_workspace_member(rc.source_workspace_id))
  )
);

create policy contact_document_transfers_select on public.contact_document_transfers for select using (
  exists (
    select 1 from public.contact_shares cs
    where cs.id = contact_document_transfers.contact_share_id
      and (public.is_workspace_member(cs.source_workspace_id) or public.is_workspace_member(cs.destination_workspace_id))
  )
);
