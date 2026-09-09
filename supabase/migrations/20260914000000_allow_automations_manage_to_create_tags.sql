-- create_workspace_tag required 'clients.edit', but it's called from two
-- surfaces: the client Tags editor (clients.edit makes sense there) and the
-- automation trigger/action tag fields (client.tag_added, add_tag,
-- remove_tag), where the relevant permission is 'automations.manage'. The
-- "Staff" system role has automations.manage but not clients.edit, so
-- anyone in that role saw every new tag typed into an automation rejected
-- silently by ensureTagsConfirmed's window.alert. rename_workspace_tag and
-- delete_workspace_tag already accept automations.manage alone -- this
-- brings create_workspace_tag in line with them instead of requiring both.
create or replace function public.create_workspace_tag(p_workspace_id uuid, p_name text)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_name text := btrim(p_name);
  v_id uuid;
begin
  if not (public.has_permission(p_workspace_id, 'clients.edit') or public.has_permission(p_workspace_id, 'automations.manage')) then
    raise exception 'insufficient permissions to create a tag in this workspace';
  end if;
  if v_name = '' then
    raise exception 'Tag name cannot be empty';
  end if;

  select id into v_id from public.workspace_tags where workspace_id = p_workspace_id and name = v_name;
  if v_id is not null then
    return v_id;
  end if;

  insert into public.workspace_tags (workspace_id, name, created_by)
  values (p_workspace_id, v_name, auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;
