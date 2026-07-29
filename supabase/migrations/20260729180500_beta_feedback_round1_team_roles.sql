-- Fixes a pre-existing round-trip bug: workspace_member_invitations allows
-- inviting Manager/Preparer/Bookkeeper/Payroll (and can_staff_write already
-- recognizes those roles), but workspace_members.role's CHECK constraint
-- only allowed Owner/Admin/Staff/Viewer -- accepting an invite with any of
-- the other four roles would fail on insert. Widening (never narrowing) the
-- constraint to the union of both role vocabularies fixes this.
alter table public.workspace_members drop constraint if exists workspace_members_role_check;
alter table public.workspace_members add constraint workspace_members_role_check
  check (role = any (array['Owner','Admin','Manager','Staff','Preparer','Bookkeeper','Payroll','Viewer']));

-- Protected member-removal and role-change RPCs. workspace_members already
-- has a trigger (protect_workspace_member_privileged_fields) that blocks a
-- direct authenticated DELETE outright, and blocks member_status/permissions
-- UPDATE unless a protected-workflow session flag is set -- these RPCs are
-- that protected path for the frontend, on top of (not instead of)
-- can_manage_workspace() RLS.
create or replace function public.remove_workspace_member(p_member_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_member public.workspace_members%rowtype;
  v_owner_id uuid;
begin
  select * into v_member from public.workspace_members where id = p_member_id for update;
  if v_member.id is null then raise exception 'Team member not found'; end if;

  if not public.can_manage_workspace(v_member.workspace_id) and not public.is_platform_admin() then
    raise exception 'Workspace owner or admin access required';
  end if;

  select owner_id into v_owner_id from public.workspaces where id = v_member.workspace_id;
  if v_member.user_id = v_owner_id then
    raise exception 'The Account Owner cannot be removed';
  end if;

  perform set_config('verexa.allow_workspace_member_admin_change', 'on', true);
  update public.workspace_members
  set member_status = 'Removed', updated_at = now()
  where id = p_member_id;

  perform public.create_workspace_audit_event(
    v_member.workspace_id, 'workspace_member_removed', 'workspace_members', v_member.id,
    'Team member removed', 'A team member was removed from the workspace.',
    null, null, null, v_member.user_id, null,
    jsonb_build_object('previous_role', v_member.role),
    jsonb_build_object('removed_by', auth.uid())
  );

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.remove_workspace_member(uuid) to authenticated;

create or replace function public.update_workspace_member_role(p_member_id uuid, p_role text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_member public.workspace_members%rowtype;
  v_owner_id uuid;
  v_role text := initcap(lower(trim(coalesce(p_role,''))));
begin
  if v_role not in ('Admin','Manager','Staff','Preparer','Bookkeeper','Payroll','Viewer') then
    raise exception 'Invalid or protected role';
  end if;

  select * into v_member from public.workspace_members where id = p_member_id for update;
  if v_member.id is null then raise exception 'Team member not found'; end if;

  if not public.can_manage_workspace(v_member.workspace_id) and not public.is_platform_admin() then
    raise exception 'Workspace owner or admin access required';
  end if;

  select owner_id into v_owner_id from public.workspaces where id = v_member.workspace_id;
  if v_member.user_id = v_owner_id then
    raise exception 'The Account Owner role cannot be changed here';
  end if;

  perform set_config('verexa.allow_workspace_member_admin_change', 'on', true);
  update public.workspace_members
  set role = v_role, updated_at = now()
  where id = p_member_id;

  perform public.create_workspace_audit_event(
    v_member.workspace_id, 'workspace_member_role_changed', 'workspace_members', v_member.id,
    'Team member role changed', 'A team member role was changed.',
    null, null, null, v_member.user_id, null,
    jsonb_build_object('from_role', v_member.role, 'to_role', v_role),
    jsonb_build_object('changed_by', auth.uid())
  );

  return jsonb_build_object('ok', true, 'role', v_role);
end;
$$;

grant execute on function public.update_workspace_member_role(uuid, text) to authenticated;
