-- workspace_users_update RLS allows a user to update their own row while
-- status = 'invited' (the invite-acceptance flow), with no WITH CHECK, so
-- Postgres reuses the USING expression as the check on the new row. That
-- carve-out was never meant to permit changing anything but status --
-- but nothing stopped an invited user from also setting role_id to a
-- workspace's Owner/Admin role (roles with workspace_id is null, such as
-- Owner/Admin/Manager, are readable by any authenticated user per
-- roles_select) in the same request, self-escalating without ever
-- touching is_owner (already protected by this same trigger).
create or replace function public.protect_workspace_users_owner_flag()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if new.is_owner is distinct from old.is_owner and current_user <> 'postgres' then
    raise exception 'is_owner cannot be changed directly; workspace ownership transfer is not supported yet';
  end if;

  if new.role_id is distinct from old.role_id
     and current_user <> 'postgres'
     and not public.is_workspace_admin(old.workspace_id) then
    raise exception 'role_id cannot be changed by the affected user; ask a workspace admin to change roles';
  end if;

  return new;
end;
$function$;
