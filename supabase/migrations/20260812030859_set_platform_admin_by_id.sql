-- Companion to set_platform_admin(email, bool) for the revoke path in the
-- platform-admin dashboard, where the target user's id is already known
-- (from user_profiles) but their email isn't exposed to the client.
create or replace function public.set_platform_admin_by_id(p_user_id uuid, p_is_platform_admin boolean)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'insufficient permissions to change platform admin status';
  end if;
  if p_user_id = auth.uid() and not p_is_platform_admin then
    raise exception 'cannot revoke your own platform admin access';
  end if;

  update public.user_profiles set is_platform_admin = p_is_platform_admin, updated_at = now() where id = p_user_id;
end;
$$;

revoke all on function public.set_platform_admin_by_id(uuid, boolean) from public, anon;
grant execute on function public.set_platform_admin_by_id(uuid, boolean) to authenticated;
