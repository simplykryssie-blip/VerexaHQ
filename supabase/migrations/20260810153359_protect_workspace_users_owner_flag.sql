-- workspace_users_update RLS (is_workspace_admin(workspace_id) OR self-accept)
-- has no column-level restriction, so any workspace admin (including a
-- plain 'admin'-role member, not just the true owner) could set
-- is_owner = true on their own row via a direct table write. is_owner
-- gates real privilege beyond the 'admin' role: get_workspace_billing_admin(),
-- create_workspace()'s initial grant, handle_plan_price_change()'s billing
-- notices, and the app's "Invite staff" UI (gated on workspace.is_owner,
-- not just admin access) all treat it as the single designated owner.
-- No ownership-transfer feature exists yet, so block the column outright
-- for any app-path write (RLS-governed authenticated calls and service_role
-- writes alike) -- only a direct postgres session can change it, matching
-- the same pattern already used for engagements.current_stage.
create or replace function public.protect_workspace_users_owner_flag()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if new.is_owner is distinct from old.is_owner and current_user <> 'postgres' then
    raise exception 'is_owner cannot be changed directly; workspace ownership transfer is not supported yet';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_workspace_users_owner_flag on public.workspace_users;
create trigger protect_workspace_users_owner_flag
before update on public.workspace_users
for each row execute function public.protect_workspace_users_owner_flag();
