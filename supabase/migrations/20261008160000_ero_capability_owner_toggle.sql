-- Self-serve control for ero_capability_enabled. The column and the
-- can_operate_client_book() gate it feeds were already live in production
-- with no app-facing control at all -- the only way any workspace has ever
-- gotten it was a one-off direct database UPDATE (how Doucet Financial
-- Group got it, and how MKB Financial Group was just unblocked the same
-- way after hitting "this workspace is not enabled to operate a
-- client/engagement book" with no way to self-serve past it).
--
-- Deliberately owner-only, not admin -- stricter than is_workspace_admin()
-- on purpose, since this gate concerns a service bureau's ERO/compliance
-- posture (whether it's credentialed to operate its own direct client
-- book rather than only managing connected partner firms), not a routine
-- operational setting. Scoped to service_bureau workspaces only: the
-- underlying gate (workspace_type <> 'service_bureau' or
-- ero_capability_enabled) already passes every other workspace type
-- regardless of this flag, so toggling it anywhere else would be a no-op
-- that only invites confusion.
create or replace function public.set_ero_capability_enabled(p_workspace_id uuid, p_enabled boolean)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_workspace_type text;
  v_is_owner boolean;
begin
  select workspace_type into v_workspace_type from public.workspaces where id = p_workspace_id;
  if v_workspace_type is null then
    raise exception 'workspace not found';
  end if;
  if v_workspace_type <> 'service_bureau' then
    raise exception 'this setting only applies to Service Bureau workspaces';
  end if;

  select exists (
    select 1 from public.workspace_users wu
    where wu.workspace_id = p_workspace_id and wu.user_id = auth.uid() and wu.status = 'active' and wu.is_owner
  ) into v_is_owner;

  if not (v_is_owner or public.is_platform_admin()) then
    raise exception 'only the workspace owner can change this setting';
  end if;

  update public.workspaces set ero_capability_enabled = p_enabled where id = p_workspace_id;

  return p_enabled;
end;
$function$;

revoke all on function public.set_ero_capability_enabled(uuid, boolean) from public, anon;
grant execute on function public.set_ero_capability_enabled(uuid, boolean) to authenticated;
