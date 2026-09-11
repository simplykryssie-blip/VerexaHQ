-- Demo shells (workspaces.is_demo = true) exist to show off the product,
-- not as real staff -- get_platform_staff_directory previously had no
-- is_demo filter, so the synthetic demo personas (e.g. monica.jones@...)
-- showed up in the IT staff directory report alongside real customers'
-- actual staff. Same exclusion pattern already used by
-- get_platform_account_holders and the /platform-admin dashboard/review
-- pages.
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
    and w.is_demo = false
    and public.is_platform_it()
  order by au.last_sign_in_at desc nulls last;
$$;
