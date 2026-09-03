-- "Grant IT access" on the Platform Admin page only ever worked on someone
-- who already had a VerexaHQ login (it looks the email up in auth.users and
-- fails with "no user found" otherwise) -- there was no way to bring a brand
-- new person onto the platform's IT roster at all. Staff invites already
-- solve exactly this problem (email a real invite, let them create an
-- account, land them in the app), so this reuses that same
-- workspace_invitations/accept_workspace_invitation_by_token machinery
-- rather than building a second parallel invite+signup flow: a pending IT
-- invite is just a normal invitation to join Verexa's own home workspace
-- (is_platform_home), tagged so acceptance also flips is_platform_it.

alter table public.workspace_invitations add column if not exists grant_platform_it boolean not null default false;

create or replace function public.accept_workspace_invitation_by_token(p_token uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invitation public.workspace_invitations;
  v_user_email text;
begin
  select * into v_invitation from public.workspace_invitations where token = p_token;

  if v_invitation.id is null then
    raise exception 'invitation not found';
  end if;
  if v_invitation.status <> 'pending' then
    raise exception 'invitation is no longer pending';
  end if;
  if v_invitation.expires_at < now() then
    update public.workspace_invitations set status = 'expired', updated_at = now() where id = v_invitation.id;
    raise exception 'invitation has expired';
  end if;

  select email into v_user_email from auth.users where id = auth.uid();
  if v_user_email is null or lower(v_user_email) <> lower(v_invitation.email) then
    raise exception 'this invitation was sent to a different email address';
  end if;

  insert into public.workspace_users (workspace_id, user_id, role_id, status, invited_by, invited_at, joined_at)
  values (v_invitation.workspace_id, auth.uid(), v_invitation.role_id, 'active', v_invitation.invited_by, v_invitation.created_at, now())
  on conflict (workspace_id, user_id) do update
    set role_id = excluded.role_id, status = 'active', joined_at = now();

  if v_invitation.grant_platform_it then
    update public.user_profiles set is_platform_it = true, updated_at = now() where id = auth.uid();
  end if;

  update public.workspace_invitations
  set status = 'accepted', accepted_by = auth.uid(), accepted_at = now(), updated_at = now()
  where id = v_invitation.id;

  return v_invitation.workspace_id;
end;
$$;

drop function if exists public.get_invitation_preview(uuid);

create or replace function public.get_invitation_preview(p_token uuid)
returns table(
  email text,
  status text,
  expires_at timestamptz,
  workspace_name text,
  role_name text,
  account_exists boolean,
  password_min_length int,
  grant_platform_it boolean
)
language sql
stable security definer
set search_path = public
as $$
  select
    wi.email,
    wi.status,
    wi.expires_at,
    w.name,
    r.name,
    exists (select 1 from auth.users u where lower(u.email) = lower(wi.email)),
    coalesce((select password_min_length from public.workspace_security_policies where workspace_id = wi.workspace_id), 8),
    wi.grant_platform_it
  from public.workspace_invitations wi
  join public.workspaces w on w.id = wi.workspace_id
  join public.roles r on r.id = wi.role_id
  where wi.token = p_token;
$$;

revoke all on function public.get_invitation_preview(uuid) from public;
grant execute on function public.get_invitation_preview(uuid) to anon, authenticated;

-- Called by the Platform Admin "Grant IT access" box. Grants immediately for
-- an email that already has a VerexaHQ login; otherwise emails a real invite
-- to join Verexa's home workspace, tagged to grant IT access on acceptance.
create or replace function public.grant_or_invite_platform_it(p_email text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_home_workspace_id uuid;
  v_staff_role_id uuid;
  v_invitation public.workspace_invitations;
begin
  if not public.is_platform_admin() then
    raise exception 'insufficient permissions to change platform IT status';
  end if;

  select id into v_user_id from auth.users where lower(email) = lower(p_email);
  if v_user_id is not null then
    update public.user_profiles set is_platform_it = true, updated_at = now() where id = v_user_id;
    return jsonb_build_object('granted', true);
  end if;

  select id into v_home_workspace_id from public.workspaces where is_platform_home = true limit 1;
  if v_home_workspace_id is null then
    raise exception 'no platform home workspace is configured';
  end if;

  select id into v_staff_role_id from public.roles where name = 'Staff' and workspace_id is null limit 1;
  if v_staff_role_id is null then
    raise exception 'no default Staff role is configured';
  end if;

  insert into public.workspace_invitations (workspace_id, email, role_id, invited_by, grant_platform_it)
  values (v_home_workspace_id, lower(p_email), v_staff_role_id, auth.uid(), true)
  on conflict (workspace_id, lower(email)) where status = 'pending'
  do update set role_id = excluded.role_id, invited_by = excluded.invited_by, grant_platform_it = true,
    token = gen_random_uuid(), expires_at = now() + interval '7 days', updated_at = now()
  returning * into v_invitation;

  return jsonb_build_object('granted', false, 'invitation', to_jsonb(v_invitation));
end;
$$;

revoke all on function public.grant_or_invite_platform_it(text) from public, anon;
grant execute on function public.grant_or_invite_platform_it(text) to authenticated;
