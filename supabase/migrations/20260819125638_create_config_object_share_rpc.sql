-- Lets an ERO/Service Bureau workspace admin opt in to sharing one of its
-- config objects (organizer, engagement letter, etc.) with a specific active
-- downline connection. Never automatic -- the recipient still has to accept
-- via accept_config_object_share before anything is copied into their account.
create or replace function public.create_config_object_share(p_table text, p_object_id uuid, p_target_workspace_id uuid)
returns uuid
language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_source_workspace_id uuid;
  v_share_id uuid;
begin
  if not public.is_valid_config_table(p_table) then
    raise exception 'unsupported config table: %', p_table;
  end if;

  execute format('select workspace_id from public.%I where id = $1', p_table)
    into v_source_workspace_id using p_object_id;

  if v_source_workspace_id is null then
    raise exception '% not found, or is a system-wide object that cannot be shared', p_table;
  end if;

  if not public.is_workspace_admin(v_source_workspace_id) then
    raise exception 'insufficient permissions to share this object';
  end if;

  if not exists (
    select 1 from public.firm_connections
    where status = 'active'
      and parent_workspace_id = v_source_workspace_id
      and child_workspace_id = p_target_workspace_id
  ) then
    raise exception 'target workspace is not an active downline connection';
  end if;

  if exists (
    select 1 from public.config_object_shares
    where object_type = p_table and object_id = p_object_id
      and shared_with_workspace_id = p_target_workspace_id and status = 'pending'
  ) then
    raise exception 'a pending share for this object already exists for that workspace';
  end if;

  insert into public.config_object_shares (object_type, object_id, shared_by_workspace_id, shared_with_workspace_id, shared_by, status)
  values (p_table, p_object_id, v_source_workspace_id, p_target_workspace_id, auth.uid(), 'pending')
  returning id into v_share_id;

  return v_share_id;
end;
$function$;

revoke all on function public.create_config_object_share(text, uuid, uuid) from public, anon;
grant execute on function public.create_config_object_share(text, uuid, uuid) to authenticated;
