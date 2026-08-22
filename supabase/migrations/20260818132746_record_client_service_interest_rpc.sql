-- Staff-side equivalent of capture_public_lead_from_contact_step's interest
-- insert / submit_portal_basic_info's interest insert -- lets staff record
-- what service a manually-added lead wants (source='manual', already a valid
-- value on client_service_interests) without requiring a public token or a
-- portal session. This is what lets a manually-created lead fire the same
-- client.service_interest_selected automation (e.g. auto-send the matching
-- organizer) that public-link and portal leads already trigger.
create or replace function public.record_client_service_interest(
  p_client_id uuid,
  p_workspace_id uuid,
  p_service_category_id uuid,
  p_service_id uuid
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.has_permission(p_workspace_id, 'clients.edit') then
    raise exception 'insufficient permissions to record a service interest in this workspace';
  end if;

  if not exists (select 1 from public.clients where id = p_client_id and workspace_id = p_workspace_id) then
    raise exception 'client not found in this workspace';
  end if;

  insert into public.client_service_interests (client_id, workspace_id, service_category_id, service_id, source)
  values (p_client_id, p_workspace_id, p_service_category_id, p_service_id, 'manual');
end;
$$;

revoke all on function public.record_client_service_interest(uuid, uuid, uuid, uuid) from public, anon;
grant execute on function public.record_client_service_interest(uuid, uuid, uuid, uuid) to authenticated;
