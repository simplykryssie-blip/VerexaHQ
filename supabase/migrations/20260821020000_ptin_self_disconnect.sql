-- An independently-billed connected PTIN (billing_responsibility <>
-- 'ero' -- i.e. they pay for their own subscription, not an added seat on
-- the ERO's plan) can now disconnect themselves from their ERO, not just
-- the other way around. An ERO-covered seat still can only be disconnected
-- by the ERO -- releasing that PTIN back to their own billing is the ERO's
-- call (see ConnectedPtinRow's "Release billing" action), not something
-- the PTIN can walk away from unilaterally while the ERO is still paying
-- for their seat.
create or replace function public.disconnect_firm_connection(p_connection_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_row public.firm_connections;
  v_is_ero_admin boolean;
  v_is_ptin_admin boolean;
begin
  select * into v_row from public.firm_connections where id = p_connection_id for update;
  if v_row.id is null then
    raise exception 'connection not found';
  end if;

  v_is_ero_admin := public.is_workspace_admin(v_row.parent_workspace_id);
  v_is_ptin_admin := public.is_workspace_admin(v_row.child_workspace_id) and v_row.billing_responsibility <> 'ero';

  if not (v_is_ero_admin or v_is_ptin_admin) then
    raise exception 'Only the ERO, or an independently-billed PTIN, can disconnect this connection.';
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

  if v_is_ptin_admin and not v_is_ero_admin then
    if v_row.invited_by is not null then
      perform public.create_notification(
        v_row.parent_workspace_id, v_row.invited_by, 'FIRM_CONNECTION_REVOKED',
        'firm_connection_revoked', jsonb_build_object('firm_connection_id', p_connection_id),
        array['In-App'::text], 'Medium', 'firm_connection', p_connection_id
      );
    end if;
  else
    if v_row.responded_by is not null then
      perform public.create_notification(
        v_row.child_workspace_id, v_row.responded_by, 'FIRM_CONNECTION_REVOKED',
        'firm_connection_revoked', jsonb_build_object('firm_connection_id', p_connection_id),
        array['In-App'::text], 'Medium', 'firm_connection', p_connection_id
      );
    end if;
  end if;
end;
$function$;

revoke all on function public.disconnect_firm_connection(uuid) from public, anon;
grant execute on function public.disconnect_firm_connection(uuid) to authenticated;
