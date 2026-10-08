-- Migration-history recovery (automation/client-book reconciliation).
--
-- Dual Service Bureau + ERO capability: client/engagement creation gate.
-- A plain service_bureau workspace has no business owning its own
-- client/engagement book (that's the ERO/multi_office_firm/independent_ptin
-- shape) unless explicitly granted ero_capability_enabled. Doucet Financial
-- Group already operates one (2,005 real client rows) and is grandfathered
-- in by the backfill below; every other service_bureau workspace defaults
-- to false.
--
-- This, the five RPCs recovered in the next migration, and the final
-- execute_automation_step recovered further below were already applied to
-- and verified live in production in an earlier session, but were never
-- captured in this repository's migration history -- confirmed via
-- pg_get_functiondef against production during this reconciliation. This
-- migration recovers that history rather than re-deriving it, so a fresh
-- database build matches what is actually running.
alter table public.workspaces
  add column if not exists ero_capability_enabled boolean not null default false;

comment on column public.workspaces.ero_capability_enabled is
  'Only meaningful when workspace_type = ''service_bureau''. When true, this '
  'Service Bureau workspace additionally operates its own ERO business in '
  'the SAME workspace: it may own clients/engagements, manage W-2 '
  'ptin_preparer staff, and hold ero_ptin child connections as parent. '
  'Never affects its pre-existing service_bureau_ero/service_bureau_ptin '
  'network, Packages, or Network Command Center, which are keyed on '
  'relationship_type, not this flag. No-op for every other workspace_type.';

create or replace function public.can_operate_client_book(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(
    (select w.workspace_type <> 'service_bureau' or w.ero_capability_enabled
     from public.workspaces w where w.id = p_workspace_id),
    false
  );
$$;

comment on function public.can_operate_client_book(uuid) is
  'True for every workspace_type except service_bureau, where it additionally '
  'requires ero_capability_enabled. Gates NEW client/engagement creation only '
  '-- never referenced by any SELECT/UPDATE/DELETE policy, so existing rows '
  'stay fully readable/editable under their normal permissions regardless of '
  'this flag.';

-- Default grant is EXECUTE to PUBLIC (inherited by anon); this is
-- SECURITY DEFINER and bypasses RLS, so an anon caller could otherwise
-- learn any workspace id's service_bureau/capability state. Restricted to
-- match its sibling authorization helpers (has_permission,
-- is_workspace_operational), none of which grant to anon or PUBLIC.
revoke execute on function public.can_operate_client_book(uuid) from public, anon;

-- clients has no INSERT policy today -- this adds the first one, for
-- defense-in-depth alongside the RPC-level checks in the next migration.
create policy clients_insert on public.clients
  for insert
  with check (
    has_permission(workspace_id, 'clients.create')
    and is_workspace_operational(workspace_id)
    and public.can_operate_client_book(workspace_id)
  );

-- engagements_insert already exists -- add the new clause onto it via
-- ALTER POLICY, preserving every other property.
alter policy engagements_insert on public.engagements
  with check (
    has_permission(workspace_id, 'engagements.manage')
    and is_workspace_operational(workspace_id)
    and public.can_operate_client_book(workspace_id)
  );

-- Backfill: Doucet Financial Group is a real, non-demo service_bureau
-- workspace that already has 2,005 clients and pending ero_ptin invites --
-- it was already operating an ERO book before this gate existed. Every
-- other service_bureau workspace remains at the default false unless
-- explicitly enabled later through the approved dual-capability flow.
update public.workspaces
set ero_capability_enabled = true
where id = '0867bbc5-e62b-4217-8bad-11351c24def5' -- Doucet Financial Group
  and workspace_type = 'service_bureau';
