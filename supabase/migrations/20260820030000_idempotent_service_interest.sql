-- Found while testing: record_client_service_interest had no duplicate
-- guard, so selecting a service a client already expressed interest in
-- inserted a second client_service_interests row, which re-fired
-- client.service_interest_selected and silently re-sent that service's
-- organizer email. The New Client modal never hit this (each service in
-- its checkbox list can only be checked once per submission), but any
-- other caller re-recording an already-known interest -- including the
-- new staff-facing "add a service interest to an existing client" control
-- -- could trigger it. Recording an interest should be idempotent: skip
-- the insert (and the automation fire that comes with it) if this client
-- already has this exact service on file.
create or replace function public.record_client_service_interest(
  p_client_id uuid,
  p_workspace_id uuid,
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

  if exists (
    select 1 from public.client_service_interests
    where client_id = p_client_id and service_id = p_service_id
  ) then
    return;
  end if;

  insert into public.client_service_interests (client_id, workspace_id, service_category_id, service_id, source)
  select p_client_id, p_workspace_id, s.service_category_id, s.id, 'manual'
  from public.services s
  where s.id = p_service_id;
end;
$$;
