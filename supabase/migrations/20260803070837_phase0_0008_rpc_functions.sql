create or replace function public.create_workspace(
  p_name text,
  p_workspace_type text default 'independent_ptin',
  p_timezone text default 'America/New_York'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_owner_role_id uuid;
  v_slug text;
  v_suffix int := 0;
begin
  if auth.uid() is null then
    raise exception 'create_workspace requires an authenticated user';
  end if;

  select id into v_owner_role_id from public.roles where workspace_id is null and slug = 'owner';
  if v_owner_role_id is null then
    raise exception 'system owner role is not seeded';
  end if;

  v_slug := regexp_replace(lower(btrim(p_name)), '[^a-z0-9]+', '-', 'g');
  v_slug := regexp_replace(v_slug, '(^-+|-+$)', '', 'g');
  if v_slug = '' then
    v_slug := 'workspace';
  end if;
  while exists (select 1 from public.workspaces where slug = v_slug || case when v_suffix = 0 then '' else '-' || v_suffix end) loop
    v_suffix := v_suffix + 1;
  end loop;
  if v_suffix > 0 then
    v_slug := v_slug || '-' || v_suffix;
  end if;

  insert into public.workspaces (name, slug, workspace_type, timezone, created_by, primary_contact_email)
  values (p_name, v_slug, p_workspace_type, p_timezone, auth.uid(), (select email from auth.users where id = auth.uid()))
  returning id into v_workspace_id;

  insert into public.workspace_users (workspace_id, user_id, role_id, is_owner, status, joined_at)
  values (v_workspace_id, auth.uid(), v_owner_role_id, true, 'active', now());

  insert into public.branding (workspace_id, display_name)
  values (v_workspace_id, p_name);

  insert into public.workspace_feature_flags (workspace_id, feature_flag_id, is_enabled)
  select v_workspace_id, id, true from public.feature_flags where is_core;

  update public.user_profiles set default_workspace_id = v_workspace_id
  where id = auth.uid() and default_workspace_id is null;

  return v_workspace_id;
end;
$$;
comment on function public.create_workspace(text, text, text) is 'Provisions a new tenant workspace and makes the caller its owner. The only sanctioned path for tenant creation.';

grant execute on function public.create_workspace(text, text, text) to authenticated;

create or replace function public.get_my_workspaces()
returns table (
  workspace_id uuid,
  workspace_name text,
  workspace_slug text,
  workspace_type text,
  role_slug text,
  role_name text,
  is_owner boolean,
  status text
)
language sql
stable
set search_path = public
as $$
  select
    w.id, w.name, w.slug, w.workspace_type,
    r.slug, r.name,
    wu.is_owner, wu.status
  from public.workspace_users wu
  join public.workspaces w on w.id = wu.workspace_id
  join public.roles r on r.id = wu.role_id
  where wu.user_id = auth.uid()
  order by wu.created_at;
$$;
comment on function public.get_my_workspaces() is 'Lists every workspace the calling user belongs to, with their role and membership status.';

grant execute on function public.get_my_workspaces() to authenticated;

create or replace function public.invite_workspace_user(
  p_workspace_id uuid,
  p_user_id uuid,
  p_role_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.is_workspace_admin(p_workspace_id) then
    raise exception 'insufficient permissions to invite members to this workspace';
  end if;
  if not exists (select 1 from public.roles where id = p_role_id and (workspace_id is null or workspace_id = p_workspace_id)) then
    raise exception 'role does not belong to this workspace';
  end if;

  insert into public.workspace_users (workspace_id, user_id, role_id, status, invited_by, invited_at)
  values (p_workspace_id, p_user_id, p_role_id, 'invited', auth.uid(), now())
  on conflict (workspace_id, user_id) do update
    set role_id = excluded.role_id, status = 'invited', invited_by = excluded.invited_by, invited_at = now()
  returning id into v_id;

  insert into public.notification_queue (workspace_id, recipient_user_id, channel, template_key, payload)
  values (p_workspace_id, p_user_id, 'portal', 'workspace_invitation',
    jsonb_build_object('workspace_id', p_workspace_id, 'invited_by', auth.uid()));

  return v_id;
end;
$$;
comment on function public.invite_workspace_user(uuid, uuid, uuid) is 'Adds an already-registered user to a workspace with invited status and queues a notification.';

grant execute on function public.invite_workspace_user(uuid, uuid, uuid) to authenticated;

create or replace function public.accept_workspace_invitation(p_workspace_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.workspace_users
  set status = 'active', joined_at = now()
  where workspace_id = p_workspace_id and user_id = auth.uid() and status = 'invited';
$$;
comment on function public.accept_workspace_invitation(uuid) is 'Caller accepts their own pending invitation to a workspace.';

grant execute on function public.accept_workspace_invitation(uuid) to authenticated;

create or replace function public.revoke_workspace_user(p_workspace_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_workspace_admin(p_workspace_id) then
    raise exception 'insufficient permissions to remove members from this workspace';
  end if;
  update public.workspace_users
  set status = 'removed'
  where workspace_id = p_workspace_id and user_id = p_user_id;
end;
$$;
comment on function public.revoke_workspace_user(uuid, uuid) is 'Workspace admin revokes a member''s access without deleting historical records.';

grant execute on function public.revoke_workspace_user(uuid, uuid) to authenticated;

create or replace function public.set_feature_flag(
  p_workspace_id uuid,
  p_flag_key text,
  p_enabled boolean,
  p_config jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_flag_id uuid;
begin
  if not public.is_workspace_admin(p_workspace_id) then
    raise exception 'insufficient permissions to manage feature flags for this workspace';
  end if;

  select id into v_flag_id from public.feature_flags where key = p_flag_key;
  if v_flag_id is null then
    raise exception 'unknown feature flag key: %', p_flag_key;
  end if;

  insert into public.workspace_feature_flags (workspace_id, feature_flag_id, is_enabled, config, updated_by)
  values (p_workspace_id, v_flag_id, p_enabled, p_config, auth.uid())
  on conflict (workspace_id, feature_flag_id) do update
    set is_enabled = excluded.is_enabled, config = excluded.config, updated_by = excluded.updated_by, updated_at = now();
end;
$$;
comment on function public.set_feature_flag(uuid, text, boolean, jsonb) is 'Enables/disables a module for a workspace. Workspace-admin only.';

grant execute on function public.set_feature_flag(uuid, text, boolean, jsonb) to authenticated;
