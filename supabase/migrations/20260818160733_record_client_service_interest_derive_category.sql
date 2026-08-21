-- Same simplification as the two lead-capture RPCs: derive service_category_id
-- from the service itself instead of requiring the caller to pass it, so the
-- staff Add Client multi-select loop only needs to know which service ids
-- were checked, not their categories.
drop function if exists public.record_client_service_interest(uuid, uuid, uuid, uuid);

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

  insert into public.client_service_interests (client_id, workspace_id, service_category_id, service_id, source)
  select p_client_id, p_workspace_id, s.service_category_id, s.id, 'manual'
  from public.services s
  where s.id = p_service_id;
end;
$$;

revoke all on function public.record_client_service_interest(uuid, uuid, uuid) from public, anon;
grant execute on function public.record_client_service_interest(uuid, uuid, uuid) to authenticated;
