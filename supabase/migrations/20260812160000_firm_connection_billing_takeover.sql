-- Billing responsibility is decoupled from the connection itself -- an ERO
-- can connect a PTIN purely for the review/e-file workflow without any
-- money changing hands, or explicitly opt in to cover that PTIN's
-- subscription + add-on billing, and just as easily hand it back later.
-- These RPCs only touch workspace_subscriptions.seat_count (the DB side of
-- truth); the actual Stripe subscription-item quantity sync happens in
-- application code right after calling these, since Stripe's API isn't
-- reachable from plain SQL.

create or replace function public.accept_firm_connection_billing(p_connection_id uuid)
returns public.firm_connections
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_row public.firm_connections;
begin
  select * into v_row from public.firm_connections where id = p_connection_id for update;
  if v_row.id is null then
    raise exception 'connection not found';
  end if;
  if not public.is_workspace_admin(v_row.parent_workspace_id) then
    raise exception 'Only the ERO can accept billing for this connection.';
  end if;
  if v_row.status <> 'active' then
    raise exception 'Only an active connection can have its billing accepted.';
  end if;
  if v_row.billing_responsibility = 'ero' then
    return v_row;
  end if;

  if not exists (select 1 from public.workspace_subscriptions where workspace_id = v_row.parent_workspace_id) then
    raise exception 'This ERO has no active subscription to bill the seat against.';
  end if;

  update public.firm_connections set billing_responsibility = 'ero', updated_at = now() where id = p_connection_id returning * into v_row;
  update public.workspace_subscriptions set seat_count = coalesce(seat_count, 0) + 1, updated_at = now() where workspace_id = v_row.parent_workspace_id;

  if v_row.responded_by is not null then
    perform public.create_notification(
      v_row.child_workspace_id, v_row.responded_by, 'FIRM_CONNECTION_BILLING_ACCEPTED',
      'firm_connection_billing_accepted', jsonb_build_object('firm_connection_id', p_connection_id),
      array['In-App'::text], 'Medium', 'firm_connection', p_connection_id
    );
  end if;

  return v_row;
end;
$$;

grant execute on function public.accept_firm_connection_billing(uuid) to authenticated;

create or replace function public.release_firm_connection_billing(p_connection_id uuid)
returns public.firm_connections
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_row public.firm_connections;
begin
  select * into v_row from public.firm_connections where id = p_connection_id for update;
  if v_row.id is null then
    raise exception 'connection not found';
  end if;
  if not public.is_workspace_admin(v_row.parent_workspace_id) then
    raise exception 'Only the ERO can release billing for this connection.';
  end if;
  if v_row.billing_responsibility <> 'ero' then
    return v_row;
  end if;

  update public.firm_connections set billing_responsibility = 'ptin_self', updated_at = now() where id = p_connection_id returning * into v_row;
  update public.workspace_subscriptions set seat_count = greatest(coalesce(seat_count, 1) - 1, 0), updated_at = now() where workspace_id = v_row.parent_workspace_id;

  if v_row.responded_by is not null then
    perform public.create_notification(
      v_row.child_workspace_id, v_row.responded_by, 'FIRM_CONNECTION_BILLING_RELEASED',
      'firm_connection_billing_released', jsonb_build_object('firm_connection_id', p_connection_id),
      array['In-App'::text], 'Medium', 'firm_connection', p_connection_id
    );
  end if;

  return v_row;
end;
$$;

grant execute on function public.release_firm_connection_billing(uuid) to authenticated;

-- Disconnecting always ends any billing takeover with it, decrementing the
-- ERO's seat count if it was covering this PTIN at the time.
create or replace function public.disconnect_firm_connection(p_connection_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_row public.firm_connections;
begin
  select * into v_row from public.firm_connections where id = p_connection_id for update;
  if v_row.id is null then
    raise exception 'connection not found';
  end if;
  if not public.is_workspace_admin(v_row.parent_workspace_id) then
    raise exception 'Only the ERO can disconnect this connection.';
  end if;

  if v_row.billing_responsibility = 'ero' then
    update public.workspace_subscriptions set seat_count = greatest(coalesce(seat_count, 1) - 1, 0), updated_at = now() where workspace_id = v_row.parent_workspace_id;
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
