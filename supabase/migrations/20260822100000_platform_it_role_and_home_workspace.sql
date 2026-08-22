-- Platform IT role: a narrower staff role for system health and
-- troubleshooting visibility, explicitly excluding billing/revenue data
-- and the ability to grant admin/IT access itself. Full platform admins
-- retain everything IT can see (is_platform_it() also returns true for
-- admins), so this is additive, not a replacement.

alter table public.user_profiles add column if not exists is_platform_it boolean not null default false;

create or replace function public.is_platform_it()
returns boolean
language sql
stable security definer
set search_path = public
as $$
  select coalesce(
    (select is_platform_it or is_platform_admin from public.user_profiles where id = auth.uid()),
    false
  );
$$;

revoke all on function public.is_platform_it() from public, anon;
grant execute on function public.is_platform_it() to authenticated;

-- Grant/revoke IT access -- gated to platform admins only, mirrors
-- set_platform_admin/set_platform_admin_by_id exactly.
create or replace function public.set_platform_it(p_user_email text, p_is_platform_it boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  if not public.is_platform_admin() then
    raise exception 'insufficient permissions to change platform IT status';
  end if;

  select id into v_user_id from auth.users where email = p_user_email;
  if v_user_id is null then
    raise exception 'no user found with email %', p_user_email;
  end if;

  update public.user_profiles set is_platform_it = p_is_platform_it, updated_at = now() where id = v_user_id;
end;
$$;

revoke all on function public.set_platform_it(text, boolean) from public, anon;
grant execute on function public.set_platform_it(text, boolean) to authenticated;

create or replace function public.set_platform_it_by_id(p_user_id uuid, p_is_platform_it boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'insufficient permissions to change platform IT status';
  end if;

  update public.user_profiles set is_platform_it = p_is_platform_it, updated_at = now() where id = p_user_id;
end;
$$;

revoke all on function public.set_platform_it_by_id(uuid, boolean) from public, anon;
grant execute on function public.set_platform_it_by_id(uuid, boolean) to authenticated;

-- Read access for IT (also covers admins via is_platform_it()'s own OR):
-- system failures, the workspace roster (name/type/status only -- no
-- billing table is touched here), user profiles for support lookups, and
-- the two background job queues.
drop policy if exists system_failure_log_select on public.system_failure_log;
create policy system_failure_log_select on public.system_failure_log
  for select using (is_platform_it());

drop policy if exists workspaces_select_platform_admin on public.workspaces;
create policy workspaces_select_platform_admin on public.workspaces
  for select using (is_platform_it());

drop policy if exists user_profiles_select on public.user_profiles;
create policy user_profiles_select on public.user_profiles
  for select using (
    id = (select auth.uid())
    or is_platform_it()
    or exists (
      select 1 from public.workspace_users a
      join public.workspace_users b on b.workspace_id = a.workspace_id
      where a.user_id = (select auth.uid()) and a.status = 'active'
        and b.user_id = user_profiles.id and b.status = 'active'
    )
  );

create policy calendar_sync_queue_select_platform_it on public.calendar_sync_queue
  for select using (is_platform_it());

drop policy if exists notification_queue_select on public.notification_queue;
create policy notification_queue_select on public.notification_queue
  for select using (
    recipient_user_id = (select auth.uid())
    or (workspace_id is not null and is_workspace_admin(workspace_id))
    or is_platform_it()
  );

-- Mark Verexa's own workspace so app code can redirect straight to the
-- platform dashboards on login, without hardcoding a workspace id.
alter table public.workspaces add column if not exists is_platform_home boolean not null default false;
update public.workspaces set is_platform_home = true where id = '74321fb2-9a18-4625-ab12-01c98e888667';
