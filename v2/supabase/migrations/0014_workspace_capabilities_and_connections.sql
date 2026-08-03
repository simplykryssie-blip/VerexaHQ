-- Phase 2: Firm Configuration Engine
-- A workspace is no longer a single fixed type for sharing purposes: a
-- Service Bureau may also function as an ERO, so capabilities are separate
-- boolean flags rather than the single workspace_type classification from
-- Phase 0 (which remains for display/dashboard purposes only).
--
-- firm_connections models the internal org network sharing is built on:
--   service_bureau <-> ero
--   ero            <-> ptin_preparer
--   service_bureau <-> ptin_preparer
-- Not every PTIN has an ERO or belongs to a Service Bureau -- connections
-- are opt-in and bidirectionally confirmed.

alter table public.workspaces
  add column is_ero boolean not null default false,
  add column is_service_bureau boolean not null default false,
  add column is_ptin_preparer boolean not null default true;

comment on column public.workspaces.is_ero is 'Capability flag: this workspace can act as an Electronic Return Originator for connected PTINs.';
comment on column public.workspaces.is_service_bureau is 'Capability flag: this workspace can act as a Service Bureau for connected EROs/PTINs. A workspace can be both.';
comment on column public.workspaces.is_ptin_preparer is 'Capability flag: this workspace has its own PTIN preparer(s) originating cases.';

create table public.firm_connections (
  id uuid primary key default gen_random_uuid(),
  parent_workspace_id uuid not null references public.workspaces(id) on delete cascade,
  child_workspace_id uuid not null references public.workspaces(id) on delete cascade,
  relationship_type text not null check (relationship_type in ('service_bureau_ero', 'ero_ptin', 'service_bureau_ptin')),
  status text not null default 'pending' check (status in ('pending', 'active', 'revoked')),
  invited_by uuid references auth.users(id) on delete set null,
  responded_by uuid references auth.users(id) on delete set null,
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (parent_workspace_id <> child_workspace_id),
  unique (parent_workspace_id, child_workspace_id, relationship_type)
);
comment on table public.firm_connections is 'Internal org network: which workspace shares/oversees which, and under what relationship. Never public -- both sides are Verexa workspaces.';

create index firm_connections_parent_idx on public.firm_connections (parent_workspace_id, status);
create index firm_connections_child_idx on public.firm_connections (child_workspace_id, status);

create trigger set_updated_at before update on public.firm_connections
  for each row execute function public.set_updated_at();

create trigger audit_firm_connections after insert or update or delete on public.firm_connections
  for each row execute function public.audit_trigger_fn();

alter table public.firm_connections enable row level security;

-- Either side of the connection can see it; only the parent (the ERO/Service
-- Bureau extending the relationship) can propose it; either admin can
-- respond/revoke.
create policy firm_connections_select on public.firm_connections
  for select using (
    public.is_workspace_member(parent_workspace_id) or public.is_workspace_member(child_workspace_id)
  );

create policy firm_connections_insert on public.firm_connections
  for insert with check (public.is_workspace_admin(parent_workspace_id));

create policy firm_connections_update on public.firm_connections
  for update using (
    public.is_workspace_admin(parent_workspace_id) or public.is_workspace_admin(child_workspace_id)
  );

create policy firm_connections_delete on public.firm_connections
  for delete using (public.is_workspace_admin(parent_workspace_id));

-- ============================================================================
-- respond_to_firm_connection: the invited (child) workspace accepts/revokes.
-- ============================================================================
create or replace function public.respond_to_firm_connection(
  p_connection_id uuid,
  p_accept boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_child_workspace_id uuid;
begin
  select child_workspace_id into v_child_workspace_id
  from public.firm_connections where id = p_connection_id;

  if v_child_workspace_id is null then
    raise exception 'connection not found';
  end if;
  if not public.is_workspace_admin(v_child_workspace_id) then
    raise exception 'insufficient permissions to respond to this connection';
  end if;

  update public.firm_connections
  set status = case when p_accept then 'active' else 'revoked' end,
      responded_by = auth.uid(),
      responded_at = now()
  where id = p_connection_id;
end;
$$;
comment on function public.respond_to_firm_connection(uuid, boolean) is 'The invited workspace accepts or declines a pending firm connection.';

revoke execute on function public.respond_to_firm_connection(uuid, boolean) from public;
grant execute on function public.respond_to_firm_connection(uuid, boolean) to authenticated;
