-- Beta feedback round 1: branding entitlement, template content, team
-- invitation management RPCs, and a last-Account-Owner safety trigger.
-- Purely additive: new column, new functions, new trigger. No existing
-- table is dropped or altered destructively, no RLS policy is loosened.

-- 1. Template body/content -- form_templates had no content storage at all.
alter table public.form_templates add column if not exists content text;

-- 2. Branding entitlement -- data-driven off subscription_plans, never a
-- hardcoded plan name. Only an Active (non-trial) subscription on a plan
-- flagged includes_custom_branding may hide "Powered by VerexaHQ".
create or replace function public.can_remove_verexahq_branding(p_workspace_id uuid)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $$
  select coalesce((
    select sp.includes_custom_branding
    from public.workspace_subscriptions ws
    join public.subscription_plans sp on sp.id = ws.plan_id
    where ws.workspace_id = p_workspace_id
      and ws.subscription_status = 'Active'
    order by ws.updated_at desc
    limit 1
  ), false)
  and (public.is_workspace_member(p_workspace_id) or public.is_platform_admin());
$$;

grant execute on function public.can_remove_verexahq_branding(uuid) to authenticated;

-- 3. Team invitation management -- workspace_member_invitations stays
-- service_role-only at the RLS layer (unchanged); these SECURITY DEFINER
-- RPCs are the only way the frontend can list, resend, or revoke.
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
begin
  if not public.can_manage_workspace(p_workspace_id) and not public.is_platform_admin() then
    raise exception 'Workspace owner or admin access required';
  end if;

  return query
  select i.id, i.invite_email, i.invited_role, i.invitation_status,
         i.sent_at, i.expires_at, i.accepted_at, i.revoked_at, i.created_at
  from public.workspace_member_invitations i
  where i.workspace_id = p_workspace_id
  order by i.created_at desc;
end;
$$;

grant execute on function public.list_workspace_member_invitations(uuid) to authenticated;

create or replace function public.resend_workspace_member_invitation(p_invitation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_inv public.workspace_member_invitations%rowtype;
begin
  select * into v_inv from public.workspace_member_invitations where id = p_invitation_id for update;
  if v_inv.id is null then raise exception 'Invitation not found'; end if;

  if not public.can_manage_workspace(v_inv.workspace_id) and not public.is_platform_admin() then
    raise exception 'Workspace owner or admin access required';
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

grant execute on function public.resend_workspace_member_invitation(uuid) to authenticated;

create or replace function public.revoke_workspace_member_invitation(p_invitation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_inv public.workspace_member_invitations%rowtype;
begin
  select * into v_inv from public.workspace_member_invitations where id = p_invitation_id for update;
  if v_inv.id is null then raise exception 'Invitation not found'; end if;

  if not public.can_manage_workspace(v_inv.workspace_id) and not public.is_platform_admin() then
    raise exception 'Workspace owner or admin access required';
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

grant execute on function public.revoke_workspace_member_invitation(uuid) to authenticated;

-- 4. Last-Account-Owner safety net. workspace_members already allows
-- can_manage_workspace() (Owner/Admin) to UPDATE/DELETE rows directly under
-- RLS -- nothing stopped an Admin from demoting or removing the only Owner.
-- This trigger closes that gap regardless of which client path is used.
create or replace function public.prevent_last_owner_change()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_other_owners integer;
begin
  if old.role = 'Owner' and lower(coalesce(old.member_status,'')) = 'active' then
    select count(*) into v_other_owners
    from public.workspace_members
    where workspace_id = old.workspace_id
      and role = 'Owner'
      and lower(coalesce(member_status,'')) = 'active'
      and id <> old.id;

    if v_other_owners = 0 then
      if tg_op = 'DELETE' then
        raise exception 'Cannot remove the last Account Owner of a workspace';
      end if;
      if tg_op = 'UPDATE' and (new.role <> 'Owner' or lower(coalesce(new.member_status,'')) <> 'active') then
        raise exception 'Cannot change the role or status of the last Account Owner';
      end if;
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_last_owner_change on public.workspace_members;
create trigger trg_prevent_last_owner_change
before update or delete on public.workspace_members
for each row execute function public.prevent_last_owner_change();
