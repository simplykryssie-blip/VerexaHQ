-- The portal's only service picker was the one-time Basic Info gate --
-- Profile mode deliberately hides it, so an existing client has no way to
-- ask for a second/different service without staff manually adding the
-- interest for them. Adds a dedicated, additive-only RPC: it never touches
-- an existing client_service_interests row, only ever inserts a new one,
-- and no-ops (doesn't duplicate or re-fire automations) if the client
-- already has that exact service on file.
alter table public.client_service_interests drop constraint client_service_interests_source_check;
alter table public.client_service_interests add constraint client_service_interests_source_check
  check (source = any (array['public_organizer_signup', 'manual', 'portal_basic_info', 'public_site_page', 'portal_add_service']));

create or replace function public.request_portal_service(p_service_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_client_id uuid;
  v_workspace_id uuid;
  v_service record;
  v_already_requested boolean;
begin
  select client_id, workspace_id into v_client_id, v_workspace_id
  from public.client_portal_users
  where user_id = auth.uid() and status = 'active'
  limit 1;

  if v_client_id is null then
    raise exception 'no active portal identity for this user';
  end if;

  -- Trust nothing from the client but the id -- re-resolve category and
  -- confirm this service is actually one they're allowed to see (published,
  -- portal-visible, and either a shared template or scoped to their own
  -- workspace) rather than accepting whatever uuid was posted.
  select id, service_category_id into v_service
  from public.services
  where id = p_service_id
    and status = 'published'
    and is_portal_visible = true
    and (workspace_id is null or workspace_id = v_workspace_id);

  if v_service.id is null then
    raise exception 'That service is not available to request.';
  end if;

  select exists(
    select 1 from public.client_service_interests
    where client_id = v_client_id and service_id = p_service_id
  ) into v_already_requested;

  if v_already_requested then
    return;
  end if;

  insert into public.client_service_interests (client_id, workspace_id, service_category_id, service_id, source)
  values (v_client_id, v_workspace_id, v_service.service_category_id, p_service_id, 'portal_add_service');
end;
$$;

revoke all on function public.request_portal_service(uuid) from public, anon;
grant execute on function public.request_portal_service(uuid) to authenticated;
