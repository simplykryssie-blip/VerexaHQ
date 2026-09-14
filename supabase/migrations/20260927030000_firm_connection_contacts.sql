-- A connected firm's own contact people -- same shape as client_contacts,
-- but for a firm_connections row instead of a client, and parent-workspace
-- private (matches how PartnerAdminNotes/PartnerDetails on the Firms page
-- are already parent-only, never shown to the connected firm). Gated on
-- firm_connections.manage (the permission the rest of the Firms surface
-- already uses), not clients.edit -- a different permission domain.

create table public.firm_connection_contacts (
  id uuid default gen_random_uuid() not null primary key,
  connection_id uuid not null references public.firm_connections(id) on delete cascade,
  first_name text,
  last_name text,
  title text,
  email citext,
  phone text,
  preferred_contact_method text,
  is_primary boolean default false not null,
  display_order integer default 0 not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create index firm_connection_contacts_connection_idx on public.firm_connection_contacts(connection_id);

alter table public.firm_connection_contacts enable row level security;

create policy firm_connection_contacts_select on public.firm_connection_contacts for select using (
  exists (
    select 1 from public.firm_connections fc
    where fc.id = firm_connection_contacts.connection_id
      and public.has_permission(fc.parent_workspace_id, 'firm_connections.manage')
  )
);
create policy firm_connection_contacts_insert on public.firm_connection_contacts for insert with check (
  exists (
    select 1 from public.firm_connections fc
    where fc.id = connection_id
      and public.has_permission(fc.parent_workspace_id, 'firm_connections.manage')
  )
);
create policy firm_connection_contacts_update on public.firm_connection_contacts for update using (
  exists (
    select 1 from public.firm_connections fc
    where fc.id = firm_connection_contacts.connection_id
      and public.has_permission(fc.parent_workspace_id, 'firm_connections.manage')
  )
);
create policy firm_connection_contacts_delete on public.firm_connection_contacts for delete using (
  exists (
    select 1 from public.firm_connections fc
    where fc.id = firm_connection_contacts.connection_id
      and public.has_permission(fc.parent_workspace_id, 'firm_connections.manage')
  )
);

-- Documents: firm_connection joins the existing generic entity_type/entity_id
-- family (attachments) alongside client/engagement/etc.
alter table public.attachments drop constraint attachments_entity_type_check;
alter table public.attachments add constraint attachments_entity_type_check
  check (entity_type = any (array['client', 'engagement', 'workflow', 'task', 'invoice', 'document', 'blueprint', 'message', 'note', 'firm_connection']));

-- Tasks: a firm-scoped task needs no client/engagement at all.
alter table public.tasks add column firm_connection_id uuid references public.firm_connections(id) on delete cascade;
alter table public.tasks drop constraint tasks_engagement_or_client_chk;
alter table public.tasks add constraint tasks_engagement_or_client_chk
  check ((engagement_id is not null) or (client_id is not null) or (firm_connection_id is not null));
