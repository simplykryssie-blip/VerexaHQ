-- Client Portal identity: a portal user is an auth.users row (same signup
-- path every staff account already uses -- handle_new_auth_user already
-- creates their user_profiles row for free) linked to a client_portal_users
-- invite, never a workspace_users row. This is the deliberate boundary
-- clients.comment already documents: "clients never become staff and staff
-- never become clients."
alter table public.client_portal_users add column if not exists user_id uuid references auth.users(id);
alter table public.client_portal_users add column if not exists invitation_token uuid not null default gen_random_uuid();
alter table public.client_portal_users add column if not exists token_expires_at timestamptz not null default (now() + interval '7 days');
create unique index if not exists idx_client_portal_users_token on public.client_portal_users (invitation_token);
create index if not exists idx_client_portal_users_user on public.client_portal_users (user_id) where user_id is not null;

-- A portal user needs to read their own roster row to bootstrap the portal
-- session (which client they represent, is_primary, status) -- the
-- existing select policy only covers staff (is_workspace_member).
create policy client_portal_users_self_select on public.client_portal_users
  for select using (user_id = auth.uid());

-- Core RLS building block for every portal policy added in this and the
-- next migration -- mirrors is_workspace_member's shape exactly, scoped to
-- a client instead of a workspace.
create or replace function public.is_portal_user(p_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.client_portal_users
    where client_id = p_client_id and user_id = auth.uid() and status = 'active'
  );
$$;

create or replace function public.portal_client_id()
returns uuid
language sql
stable
security definer
set search_path to 'public'
as $$
  select client_id from public.client_portal_users
  where user_id = auth.uid() and status = 'active'
  limit 1;
$$;

-- Mirrors create_workspace_invitation exactly: permission-checked insert
-- with a fresh token issued on every call (re-inviting rotates the link).
create or replace function public.invite_portal_user(
  p_client_id uuid, p_email text, p_name text default null, p_is_primary boolean default false
)
returns public.client_portal_users
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_workspace_id uuid;
  v_row public.client_portal_users;
begin
  select workspace_id into v_workspace_id from public.clients where id = p_client_id;
  if v_workspace_id is null then
    raise exception 'client not found';
  end if;
  if not public.has_permission(v_workspace_id, 'portal.manage') then
    raise exception 'insufficient permissions to invite portal users for this client';
  end if;

  insert into public.client_portal_users (client_id, workspace_id, invited_email, invited_name, is_primary, invited_by)
  values (p_client_id, v_workspace_id, lower(p_email), p_name, p_is_primary, auth.uid())
  on conflict (client_id, lower(invited_email)) where status = 'invited'
  do update set invited_name = excluded.invited_name, is_primary = excluded.is_primary,
    invitation_token = gen_random_uuid(), token_expires_at = now() + interval '7 days'
  returning * into v_row;

  return v_row;
end;
$$;
revoke execute on function public.invite_portal_user(uuid, text, text, boolean) from public, anon;

create or replace function public.get_portal_invitation_preview(p_token uuid)
returns table(invited_email citext, invited_name text, status text, token_expires_at timestamptz, client_label text)
language sql
stable
security definer
set search_path to 'public'
as $$
  select cpu.invited_email, cpu.invited_name, cpu.status, cpu.token_expires_at,
    coalesce(c.business_name, trim(coalesce(c.first_name,'') || ' ' || coalesce(c.last_name,'')))
  from public.client_portal_users cpu
  join public.clients c on c.id = cpu.client_id
  where cpu.invitation_token = p_token;
$$;

create or replace function public.accept_portal_invitation(p_token uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_invite public.client_portal_users;
  v_user_email text;
begin
  select * into v_invite from public.client_portal_users where invitation_token = p_token;

  if v_invite.id is null then
    raise exception 'invitation not found';
  end if;
  if v_invite.status not in ('invited') then
    raise exception 'invitation is no longer pending';
  end if;
  if v_invite.token_expires_at < now() then
    raise exception 'invitation has expired';
  end if;

  select email into v_user_email from auth.users where id = auth.uid();
  if v_user_email is null or lower(v_user_email) <> lower(v_invite.invited_email::text) then
    raise exception 'this invitation was sent to a different email address';
  end if;

  update public.client_portal_users
  set status = 'active', user_id = auth.uid(), accepted_at = now()
  where id = v_invite.id;

  return v_invite.client_id;
end;
$$;
revoke execute on function public.accept_portal_invitation(uuid) from public, anon;
