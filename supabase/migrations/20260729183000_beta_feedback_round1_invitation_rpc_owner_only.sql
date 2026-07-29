-- invite_workspace_member, set_workspace_member_role, set_workspace_member_status,
-- and remove_workspace_member are all restricted to the workspace Owner (or
-- platform admin) -- never Admin. list/resend/revoke_workspace_member_invitation
-- were written against can_manage_workspace() (Owner OR Admin), which is a
-- looser, inconsistent boundary for a lifecycle step of the same invitation
-- an Admin couldn't have created. Tightening to match the established rule.
create or replace function public.list_workspace_member_invitations(p_workspace_id uuid)
returns table (
  id uuid,
  invite_email text,
  invited_role text,
  invitation_status text,
  sent_at timestamptz,
  expires_at timestamptz,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz
)
language plpgsql
stable security definer
set search_path to 'public'
as $$
declare
  v_owner_id uuid;
begin
  select owner_id into v_owner_id from public.workspaces where id = p_workspace_id;
  if v_owner_id is null then raise exception 'Workspace not found'; end if;
  if auth.uid() is distinct from v_owner_id and not public.is_platform_admin() then
    raise exception 'Workspace owner or platform admin access required';
  end if;

  return query
  select i.id, i.invite_email, i.invited_role, i.invitation_status,
         i.sent_at, i.expires_at, i.accepted_at, i.revoked_at, i.created_at
  from public.workspace_member_invitations i
  where i.workspace_id = p_workspace_id
  order by i.created_at desc;
end;
$$;

create or replace function public.resend_workspace_member_invitation(p_invitation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_inv public.workspace_member_invitations%rowtype;
  v_owner_id uuid;
begin
  select * into v_inv from public.workspace_member_invitations where id = p_invitation_id for update;
  if v_inv.id is null then raise exception 'Invitation not found'; end if;

  select owner_id into v_owner_id from public.workspaces where id = v_inv.workspace_id;
  if auth.uid() is distinct from v_owner_id and not public.is_platform_admin() then
    raise exception 'Workspace owner or platform admin access required';
  end if;

  if v_inv.invitation_status not in ('sent','expired') then
    raise exception 'Only a pending or expired invitation can be resent';
  end if;

  update public.workspace_member_invitations
  set invitation_status = 'sent', sent_at = now(), expires_at = now() + interval '7 days', updated_at = now()
  where id = v_inv.id;

  perform public.create_workspace_audit_event(
    v_inv.workspace_id, 'workspace_member_invitation_resent', 'workspace_member_invitations', v_inv.id,
    'Workspace invitation resent', 'A pending staff invitation link was refreshed.',
    null, null, null, null, null,
    jsonb_build_object('invite_email', v_inv.invite_email, 'role', v_inv.invited_role),
    jsonb_build_object('resent_by', auth.uid())
  );

  return jsonb_build_object('ok', true, 'invite_email', v_inv.invite_email, 'invitation_status', 'sent');
end;
$$;

create or replace function public.revoke_workspace_member_invitation(p_invitation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_inv public.workspace_member_invitations%rowtype;
  v_owner_id uuid;
begin
  select * into v_inv from public.workspace_member_invitations where id = p_invitation_id for update;
  if v_inv.id is null then raise exception 'Invitation not found'; end if;

  select owner_id into v_owner_id from public.workspaces where id = v_inv.workspace_id;
  if auth.uid() is distinct from v_owner_id and not public.is_platform_admin() then
    raise exception 'Workspace owner or platform admin access required';
  end if;

  if v_inv.invitation_status not in ('sent','expired') then
    raise exception 'Only a pending or expired invitation can be revoked';
  end if;

  update public.workspace_member_invitations
  set invitation_status = 'revoked', revoked_at = now(), updated_at = now()
  where id = v_inv.id;

  perform public.create_workspace_audit_event(
    v_inv.workspace_id, 'workspace_member_invitation_revoked', 'workspace_member_invitations', v_inv.id,
    'Workspace invitation revoked', 'A staff invitation was revoked before acceptance.',
    null, null, null, null, null,
    jsonb_build_object('invite_email', v_inv.invite_email, 'role', v_inv.invited_role),
    jsonb_build_object('revoked_by', auth.uid())
  );

  return jsonb_build_object('ok', true, 'invitation_status', 'revoked');
end;
$$;
