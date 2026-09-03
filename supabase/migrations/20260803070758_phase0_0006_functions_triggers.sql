create or replace function public.current_workspace_ids()
returns setof uuid
language sql
security definer
stable
set search_path = public
as $$
  select workspace_id
  from public.workspace_users
  where user_id = auth.uid() and status = 'active';
$$;
comment on function public.current_workspace_ids() is 'Workspace ids the calling user is an active member of.';

create or replace function public.is_platform_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce((select is_platform_admin from public.user_profiles where id = auth.uid()), false);
$$;
comment on function public.is_platform_admin() is 'True for Verexa staff superusers with cross-tenant access.';

create or replace function public.is_workspace_member(p_workspace_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.workspace_users
    where workspace_id = p_workspace_id and user_id = auth.uid() and status = 'active'
  ) or public.is_platform_admin();
$$;
comment on function public.is_workspace_member(uuid) is 'True if the calling user is an active member of the given workspace.';

create or replace function public.is_workspace_admin(p_workspace_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_users wu
    join public.roles r on r.id = wu.role_id
    where wu.workspace_id = p_workspace_id
      and wu.user_id = auth.uid()
      and wu.status = 'active'
      and (wu.is_owner or r.slug in ('owner', 'admin'))
  ) or public.is_platform_admin();
$$;
comment on function public.is_workspace_admin(uuid) is 'True if the calling user owns or administers the given workspace.';

create or replace function public.has_permission(p_workspace_id uuid, p_permission_key text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_users wu
    join public.role_permissions rp on rp.role_id = wu.role_id
    join public.permissions p on p.id = rp.permission_id
    where wu.workspace_id = p_workspace_id
      and wu.user_id = auth.uid()
      and wu.status = 'active'
      and p.key = p_permission_key
  ) or public.is_platform_admin();
$$;
comment on function public.has_permission(uuid, text) is 'True if the calling user holds the given permission key in the given workspace.';

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_updated_at before update on public.workspaces
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.user_profiles
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.roles
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.workspace_users
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.office_locations
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.branding
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.workspace_feature_flags
  for each row execute function public.set_updated_at();

create or replace function public.audit_trigger_fn()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_row jsonb;
begin
  v_row := to_jsonb(case when TG_OP = 'DELETE' then old else new end);
  v_workspace_id := case
    when v_row ? 'workspace_id' then (v_row->>'workspace_id')::uuid
    when TG_TABLE_NAME = 'workspaces' then (v_row->>'id')::uuid
    else null
  end;

  insert into public.audit_log (workspace_id, actor_id, entity_type, entity_id, action, before_data, after_data)
  values (
    v_workspace_id,
    auth.uid(),
    TG_TABLE_NAME,
    (v_row->>'id')::uuid,
    lower(TG_OP),
    case when TG_OP in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when TG_OP in ('UPDATE', 'INSERT') then to_jsonb(new) else null end
  );
  return coalesce(new, old);
end;
$$;
comment on function public.audit_trigger_fn() is 'Generic row-change auditor. Attach to any table needing a compliance trail.';

create trigger audit_workspaces after insert or update or delete on public.workspaces
  for each row execute function public.audit_trigger_fn();
create trigger audit_workspace_users after insert or update or delete on public.workspace_users
  for each row execute function public.audit_trigger_fn();
create trigger audit_roles after insert or update or delete on public.roles
  for each row execute function public.audit_trigger_fn();
create trigger audit_role_permissions after insert or update or delete on public.role_permissions
  for each row execute function public.audit_trigger_fn();
create trigger audit_branding after insert or update or delete on public.branding
  for each row execute function public.audit_trigger_fn();
create trigger audit_system_settings after insert or update or delete on public.system_settings
  for each row execute function public.audit_trigger_fn();
create trigger audit_workspace_feature_flags after insert or update or delete on public.workspace_feature_flags
  for each row execute function public.audit_trigger_fn();

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_profiles (id, first_name, last_name, display_name)
  values (
    new.id,
    new.raw_user_meta_data->>'first_name',
    new.raw_user_meta_data->>'last_name',
    coalesce(new.raw_user_meta_data->>'display_name', new.email)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
comment on function public.handle_new_auth_user() is 'Auto-creates a user_profiles row whenever a new auth.users row is created.';

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();
