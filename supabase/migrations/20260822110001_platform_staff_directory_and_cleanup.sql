-- Four workspace_users rows reference workspace ids that no longer exist in
-- public.workspaces (leftover from workspaces that predate the ON DELETE
-- CASCADE constraint being in its current form, or were removed by a path
-- that bypassed it). These orphans were inflating the Platform Admin
-- "Total staff" tile -- true count is 6 across 5 real workspaces, but the
-- tile summed every row in the staff map including the 4 phantom ones,
-- reading 10.
delete from public.workspace_users wu
where not exists (select 1 from public.workspaces w where w.id = wu.workspace_id);

-- Platform admin/IT staff directory: name, workspace, owner flag, and last
-- login, so "who is actually using the system and when" is answerable from
-- the UI instead of a direct DB query. auth.users isn't exposed via the
-- API at all, so this is the only way to surface last_sign_in_at safely --
-- SECURITY DEFINER lets the function read it while the filter clause below
-- keeps the result empty for anyone who isn't platform admin/IT.
create or replace function public.get_platform_staff_directory()
returns table (
  workspace_id uuid,
  workspace_name text,
  user_id uuid,
  display_name text,
  email text,
  is_owner boolean,
  last_sign_in_at timestamptz
)
language sql
stable security definer
set search_path = public
as $$
  select
    w.id,
    w.name,
    wu.user_id,
    up.display_name,
    au.email,
    wu.is_owner,
    au.last_sign_in_at
  from public.workspace_users wu
  join public.workspaces w on w.id = wu.workspace_id
  join public.user_profiles up on up.id = wu.user_id
  join auth.users au on au.id = wu.user_id
  where wu.status = 'active'
    and public.is_platform_it()
  order by au.last_sign_in_at desc nulls last;
$$;

revoke all on function public.get_platform_staff_directory() from public, anon;
grant execute on function public.get_platform_staff_directory() to authenticated;
