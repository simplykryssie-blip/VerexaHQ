-- The Users & Staff page has never shown a member's email anywhere --
-- workspace_users has no email column (email lives on auth.users, which
-- PostgREST doesn't expose), and no RPC existed to read it either. This
-- backs the new Team workload view, which needs it.
--
-- Gated on plain workspace membership rather than 'users.manage' --
-- seeing a teammate's own work email within your own firm is normal for
-- any staff member, not an admin-only action; invite/remove/role-change
-- stay gated on 'users.manage' exactly as they already are elsewhere.
create or replace function public.get_workspace_member_emails(p_workspace_id uuid)
returns table(user_id uuid, email text)
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not public.is_workspace_member(p_workspace_id) then
    raise exception 'insufficient permissions';
  end if;

  return query
  select wu.user_id, au.email::text
  from public.workspace_users wu
  join auth.users au on au.id = wu.user_id
  where wu.workspace_id = p_workspace_id;
end;
$function$;
