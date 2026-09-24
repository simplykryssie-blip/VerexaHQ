-- Contact Sharing Phase 1 (connection lifecycle integration): the one
-- explicitly-authorized change to existing firm-connection architecture.
-- Smallest possible change -- every existing line of disconnect_firm_
-- connection is preserved verbatim; only two new statements are appended
-- at the very end, after the existing notification logic, so a revoked
-- connection immediately (a) marks any retained record it currently
-- governs as connection_ended (informational lifecycle marker, not an
-- RLS gate -- see the Phase 1 schema migration's RLS comments) and (b)
-- force-expires any contact_shares still in flight under it, rather than
-- leaving that to be discovered lazily on next touch. No existing
-- behavior of this function changes; nothing is deleted.

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

  -- Contact Sharing integration (new): close out anything this now-
  -- revoked connection governs. Already-transferred retained data,
  -- version history, and documents are untouched.
  update public.ero_retained_contacts
    set status = 'connection_ended'
  where current_firm_connection_id = p_connection_id and status = 'active';

  update public.contact_shares
    set status = 'expired'
  where firm_connection_id = p_connection_id and status in ('pending', 'corrections_requested');
end;
$function$;

revoke all on function public.disconnect_firm_connection(uuid) from public, anon;
grant execute on function public.disconnect_firm_connection(uuid) to authenticated;
