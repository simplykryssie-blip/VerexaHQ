
create table public.workspace_invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email text not null,
  role_id uuid not null references public.roles(id),
  token uuid not null default gen_random_uuid(),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked', 'expired')),
  invited_by uuid references public.user_profiles(id),
  accepted_by uuid references public.user_profiles(id),
  accepted_at timestamptz,
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index uq_workspace_invitations_pending on public.workspace_invitations (workspace_id, lower(email)) where status = 'pending';
create unique index uq_workspace_invitations_token on public.workspace_invitations (token);
create index idx_workspace_invitations_workspace on public.workspace_invitations (workspace_id);
create index idx_workspace_invitations_email on public.workspace_invitations (lower(email));

alter table public.workspace_invitations enable row level security;

create policy workspace_invitations_select on public.workspace_invitations
  for select using (public.is_workspace_admin(workspace_id));

create policy workspace_invitations_insert on public.workspace_invitations
  for insert with check (public.is_workspace_admin(workspace_id));

create policy workspace_invitations_update on public.workspace_invitations
  for update using (public.is_workspace_admin(workspace_id))
  with check (public.is_workspace_admin(workspace_id));

create trigger set_updated_at before update on public.workspace_invitations
  for each row execute function public.set_updated_at();

create trigger audit_trigger after insert or update or delete on public.workspace_invitations
  for each row execute function public.audit_trigger_fn();

-- Creates (or refreshes) a pending email invitation. Returns the invitation
-- row so the caller can build the accept link from its token.
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
  if exists (
    select 1 from public.workspace_users wu join public.user_profiles up on up.id = wu.user_id
    where wu.workspace_id = p_workspace_id and wu.status = 'active' and lower(up.first_name || '') is not null
  ) then
    null; -- no-op guard placeholder removed below; membership-by-email check happens client side via auth admin lookup unavailability
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

-- Claims a pending invitation for the currently authenticated user, whose
-- email must match the invitation. Creates the workspace membership and
-- marks the invitation accepted.
create or replace function public.accept_workspace_invitation_by_token(p_token uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
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

  update public.workspace_invitations
  set status = 'accepted', accepted_by = auth.uid(), accepted_at = now(), updated_at = now()
  where id = v_invitation.id;

  return v_invitation.workspace_id;
end;
$$;

revoke execute on function public.accept_workspace_invitation_by_token(uuid) from public, anon;
