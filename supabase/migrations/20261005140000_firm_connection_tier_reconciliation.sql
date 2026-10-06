-- Firm-connection tier reconciliation.
--
-- Root cause (found while investigating why an accepted-looking MKB Financial
-- Group connection never showed up under Firms): create_firm_connection_invite
-- only ever checked p_relationship_type against the three relationship_type
-- literals globally, never against the CALLING workspace's actual tier. A
-- pending invite created while a workspace was 'ero_office' (relationship_type
-- 'ero_ptin', correct at the time) gets silently stranded the moment that
-- workspace's workspace_type later changes to 'service_bureau' -- both the
-- Firms page and the Users & Staff connected-firms section derive their
-- relationship_type filter from the workspace's CURRENT tier
-- (get_ero_connected_partners, called with CHILD_RELATIONSHIP_TYPES_BY_WORKSPACE_TYPE
-- from lib/firmConnections.ts), so the old-tier value just stops matching.
-- Nothing today reconciles a workspace's existing firm_connections rows when
-- its workspace_type changes.

-- Canonical child-relationship-type mapping, mirroring
-- lib/firmConnections.ts's CHILD_RELATIONSHIP_TYPES_BY_WORKSPACE_TYPE -- keep
-- the two in sync if either changes. independent_ptin (and any other/unknown
-- workspace_type) has no valid child relationship type: a PTIN-tier firm
-- cannot itself have connected firms beneath it.
create or replace function public.allowed_child_relationship_types(p_workspace_type text)
returns text[]
language sql
stable
set search_path to 'public'
as $function$
  select case p_workspace_type
    when 'ero_office' then array['ero_ptin']
    when 'multi_office_firm' then array['ero_ptin']
    when 'service_bureau' then array['service_bureau_ero', 'service_bureau_ptin']
    else array[]::text[]
  end;
$function$;

revoke all on function public.allowed_child_relationship_types(text) from public;
revoke execute on function public.allowed_child_relationship_types(text) from anon;
revoke execute on function public.allowed_child_relationship_types(text) from authenticated;
grant execute on function public.allowed_child_relationship_types(text) to service_role;

-- REQUIRED FIX 2: create_firm_connection_invite must validate
-- p_relationship_type against the CALLING workspace's current tier, not just
-- against the three literals that exist anywhere in the system.
create or replace function public.create_firm_connection_invite(p_workspace_id uuid, p_relationship_type text default 'ero_ptin'::text)
returns public.firm_connections
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_row public.firm_connections;
  v_workspace_type text;
begin
  if not (public.is_workspace_admin(p_workspace_id) and public.is_workspace_operational(p_workspace_id)) then
    raise exception 'insufficient permissions to create a connection invite';
  end if;

  select workspace_type into v_workspace_type from public.workspaces where id = p_workspace_id;
  if not (p_relationship_type = any(public.allowed_child_relationship_types(v_workspace_type))) then
    raise exception 'relationship_type % is not valid for a % workspace', p_relationship_type, v_workspace_type;
  end if;

  insert into public.firm_connections (parent_workspace_id, relationship_type, status, invite_token, invite_expires_at, invited_by)
  values (p_workspace_id, p_relationship_type, 'pending', gen_random_uuid(), now() + interval '14 days', auth.uid())
  returning * into v_row;

  return v_row;
end;
$function$;

-- REQUIRED FIX 3 (per-row core): reconcile one pending, unredeemed
-- firm_connection against a (new) parent workspace tier.
--   - already compatible with the new tier -> no-op.
--   - a deterministic one-to-one equivalent exists in the new tier's allowed
--     set (today: ero_ptin <-> service_bureau_ptin, both meaning "a PTIN
--     connects beneath me") -> reconciled to that equivalent.
--   - no deterministic equivalent (e.g. service_bureau_ero has no ero_office
--     counterpart, or the new tier allows no children at all) -> revoked
--     rather than guessed; the invite must be reissued under a valid type.
-- Never touches a connection that has already been accepted
-- (child_workspace_id is not null) or responded to.
create or replace function public.reconcile_pending_firm_connection(p_connection_id uuid, p_new_workspace_type text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_row public.firm_connections;
  v_new_allowed text[];
  v_equivalent text;
begin
  select * into v_row from public.firm_connections
  where id = p_connection_id and status = 'pending' and child_workspace_id is null and responded_at is null
  for update;
  if v_row.id is null then
    return;
  end if;

  v_new_allowed := public.allowed_child_relationship_types(p_new_workspace_type);

  if v_row.relationship_type = any(v_new_allowed) then
    return;
  end if;

  v_equivalent := case v_row.relationship_type
    when 'ero_ptin' then 'service_bureau_ptin'
    when 'service_bureau_ptin' then 'ero_ptin'
    else null
  end;

  if v_equivalent is not null and v_equivalent = any(v_new_allowed) then
    update public.firm_connections set relationship_type = v_equivalent where id = p_connection_id;
  else
    update public.firm_connections set status = 'revoked', invite_token = null where id = p_connection_id;
  end if;
end;
$function$;

revoke all on function public.reconcile_pending_firm_connection(uuid, text) from public;
revoke execute on function public.reconcile_pending_firm_connection(uuid, text) from anon;
revoke execute on function public.reconcile_pending_firm_connection(uuid, text) from authenticated;
grant execute on function public.reconcile_pending_firm_connection(uuid, text) to service_role;

-- REQUIRED FIX 3 (trigger): whenever and however an existing workspace's
-- tier changes -- there is currently no application RPC that does this at
-- all; MKB's and Doucet's workspace_type changes were both direct data
-- operations -- reconcile every pending invite it has issued as a parent,
-- so the structural gap is closed regardless of what eventually changes
-- workspace_type.
create or replace function public.reconcile_firm_connections_on_workspace_type_change()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_connection_id uuid;
begin
  for v_connection_id in
    select id from public.firm_connections
    where parent_workspace_id = new.id and status = 'pending' and child_workspace_id is null and responded_at is null
  loop
    perform public.reconcile_pending_firm_connection(v_connection_id, new.workspace_type);
  end loop;
  return new;
end;
$function$;

revoke all on function public.reconcile_firm_connections_on_workspace_type_change() from public;
revoke execute on function public.reconcile_firm_connections_on_workspace_type_change() from anon;
revoke execute on function public.reconcile_firm_connections_on_workspace_type_change() from authenticated;
grant execute on function public.reconcile_firm_connections_on_workspace_type_change() to service_role;

drop trigger if exists trg_reconcile_firm_connections_on_workspace_type_change on public.workspaces;
create trigger trg_reconcile_firm_connections_on_workspace_type_change
  after update of workspace_type on public.workspaces
  for each row
  when (old.workspace_type is distinct from new.workspace_type)
  execute function public.reconcile_firm_connections_on_workspace_type_change();

-- REQUIRED FIX 1 (and its generalization): apply the same reconciliation,
-- once, to every pending/unredeemed firm_connection that is already stranded
-- today -- this is not limited to MKB. The identical pattern (a pending
-- ero_ptin invite under a workspace that has since become a service_bureau)
-- was independently confirmed live for Doucet Financial Group as well
-- (3 pending invites), so the backfill is written generically rather than
-- hardcoded to one workspace or one connection id.
do $$
declare
  v_connection record;
begin
  for v_connection in
    select fc.id, w.workspace_type
    from public.firm_connections fc
    join public.workspaces w on w.id = fc.parent_workspace_id
    where fc.status = 'pending' and fc.child_workspace_id is null and fc.responded_at is null
      and not (fc.relationship_type = any(public.allowed_child_relationship_types(w.workspace_type)))
  loop
    perform public.reconcile_pending_firm_connection(v_connection.id, v_connection.workspace_type);
  end loop;
end;
$$;
