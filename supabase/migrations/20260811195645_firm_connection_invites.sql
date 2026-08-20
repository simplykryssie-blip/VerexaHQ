-- Finishes the dormant firm_connections scaffold with an invite/redeem flow
-- (mirrors create_workspace_invitation's token+expiry shape, but connects two
-- workspaces instead of a person joining one), a billing_responsibility flag
-- decoupled from the connection itself, and a communications-identity toggle
-- placeholder for the future prepaid-credits work. child_workspace_id must be
-- nullable so an ERO can generate an invite before knowing which PTIN
-- workspace will redeem it.

alter table public.firm_connections
  add column invite_token uuid unique,
  add column invite_expires_at timestamptz,
  add column billing_responsibility text not null default 'ptin_self',
  add column shares_communications_identity boolean not null default true,
  alter column child_workspace_id drop not null;

alter table public.firm_connections
  add constraint firm_connections_billing_responsibility_check
    check (billing_responsibility in ('ptin_self', 'ero'));

alter table public.firm_connections
  add constraint firm_connections_child_or_invite_check
    check (child_workspace_id is not null or (invite_token is not null and status = 'pending'));

-- Only the ERO (parent) can ever change a connection's status directly --
-- closes the raw-table-update path a PTIN could otherwise use to
-- self-disconnect. Redemption/disconnect below go through SECURITY DEFINER
-- RPCs that bypass this, same convention as every other write RPC in this
-- schema.
drop policy if exists firm_connections_update on public.firm_connections;
create policy firm_connections_update on public.firm_connections
  for update using (public.is_workspace_admin(parent_workspace_id));

create or replace function public.create_firm_connection_invite(p_workspace_id uuid, p_relationship_type text default 'ero_ptin')
returns public.firm_connections
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_row public.firm_connections;
begin
  if not public.is_workspace_admin(p_workspace_id) then
    raise exception 'insufficient permissions to create a connection invite';
  end if;
  if p_relationship_type not in ('service_bureau_ero', 'ero_ptin', 'service_bureau_ptin') then
    raise exception 'invalid relationship_type';
  end if;

  insert into public.firm_connections (parent_workspace_id, relationship_type, status, invite_token, invite_expires_at, invited_by)
  values (p_workspace_id, p_relationship_type, 'pending', gen_random_uuid(), now() + interval '14 days', auth.uid())
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.create_firm_connection_invite(uuid, text) to authenticated;

create or replace function public.get_firm_connection_invite_preview(p_token uuid)
returns table (ero_name text, status text, expires_at timestamptz, relationship_type text)
language sql
security definer
set search_path to 'public'
as $$
  select w.name, fc.status, fc.invite_expires_at, fc.relationship_type
  from public.firm_connections fc
  join public.workspaces w on w.id = fc.parent_workspace_id
  where fc.invite_token = p_token;
$$;

grant execute on function public.get_firm_connection_invite_preview(uuid) to anon, authenticated;

create or replace function public.redeem_firm_connection_invite(p_token uuid, p_workspace_id uuid)
returns public.firm_connections
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_row public.firm_connections;
begin
  if not public.is_workspace_admin(p_workspace_id) then
    raise exception 'insufficient permissions to redeem this invite';
  end if;

  select * into v_row from public.firm_connections
  where invite_token = p_token and status = 'pending' and child_workspace_id is null
  for update;

  if v_row.id is null then
    raise exception 'This invite is invalid or has already been used.';
  end if;
  if v_row.invite_expires_at < now() then
    raise exception 'This invite has expired.';
  end if;
  if v_row.parent_workspace_id = p_workspace_id then
    raise exception 'A workspace cannot connect to itself.';
  end if;
  if exists (
    select 1 from public.firm_connections
    where child_workspace_id = p_workspace_id
      and relationship_type = v_row.relationship_type
      and status = 'active'
  ) then
    raise exception 'This workspace is already connected to an ERO.';
  end if;

  update public.firm_connections
  set child_workspace_id = p_workspace_id,
      status = 'active',
      responded_by = auth.uid(),
      responded_at = now(),
      invite_token = null,
      updated_at = now()
  where id = v_row.id
  returning * into v_row;

  perform public.create_notification(
    v_row.parent_workspace_id, v_row.invited_by, 'FIRM_CONNECTION_ACCEPTED',
    'firm_connection_accepted', jsonb_build_object('firm_connection_id', v_row.id),
    array['In-App'::text], 'Medium', 'firm_connection', v_row.id
  );

  return v_row;
end;
$$;

grant execute on function public.redeem_firm_connection_invite(uuid, uuid) to authenticated;

create or replace function public.disconnect_firm_connection(p_connection_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_row public.firm_connections;
begin
  select * into v_row from public.firm_connections where id = p_connection_id;
  if v_row.id is null then
    raise exception 'connection not found';
  end if;
  if not public.is_workspace_admin(v_row.parent_workspace_id) then
    raise exception 'Only the ERO can disconnect this connection.';
  end if;

  update public.firm_connections
  set status = 'revoked',
      billing_responsibility = 'ptin_self',
      responded_by = auth.uid(),
      responded_at = now(),
      updated_at = now()
  where id = p_connection_id;

  if v_row.responded_by is not null then
    perform public.create_notification(
      v_row.child_workspace_id, v_row.responded_by, 'FIRM_CONNECTION_REVOKED',
      'firm_connection_revoked', jsonb_build_object('firm_connection_id', p_connection_id),
      array['In-App'::text], 'Medium', 'firm_connection', p_connection_id
    );
  end if;
end;
$$;

grant execute on function public.disconnect_firm_connection(uuid) to authenticated;
