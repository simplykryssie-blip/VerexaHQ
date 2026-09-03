
create or replace function public.create_workspace_invitation(p_workspace_id uuid, p_email text, p_role_id uuid)
returns public.workspace_invitations
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_row public.workspace_invitations;
begin
  if not public.is_workspace_admin(p_workspace_id) then
    raise exception 'insufficient permissions to invite members to this workspace';
  end if;
  if not exists (select 1 from public.roles where id = p_role_id and (workspace_id is null or workspace_id = p_workspace_id)) then
    raise exception 'role does not belong to this workspace';
  end if;

  insert into public.workspace_invitations (workspace_id, email, role_id, invited_by)
  values (p_workspace_id, lower(p_email), p_role_id, auth.uid())
  on conflict (workspace_id, lower(email)) where status = 'pending'
  do update set role_id = excluded.role_id, invited_by = excluded.invited_by,
    token = gen_random_uuid(), expires_at = now() + interval '7 days', updated_at = now()
  returning * into v_row;

  return v_row;
end;
$$;

revoke execute on function public.create_workspace_invitation(uuid, text, uuid) from public, anon;
