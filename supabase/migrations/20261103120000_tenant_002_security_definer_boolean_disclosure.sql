-- TENANT-002: three SECURITY DEFINER functions accepted a caller-supplied
-- p_workspace_id (and, for is_notification_enabled, p_user_id) with no
-- internal authorization check, while being directly executable by any
-- authenticated session via PostgREST RPC -- confirmed live and distinct
-- from the only legitimate application callers (the Integrations settings
-- page and the Form Template Library), which only ever pass the caller's
-- own session-derived workspace_id, never a client-supplied one.

-- is_notification_enabled has no explicit grant/revoke anywhere in prior
-- migrations -- its authenticated-EXECUTE access is Postgres's default
-- grant, never revoked, and it has zero application callers at all: every
-- call site is another SQL trigger/RPC passing an already workspace-scoped
-- row (r.user_id, r.workspace_id / new.workspace_id). Revoking the
-- authenticated PostgREST role's access removes the only reachable path
-- without touching any real caller, since those all run internally as
-- SECURITY DEFINER / service_role, which keeps EXECUTE.
revoke execute on function public.is_notification_enabled(uuid, uuid, text, text) from authenticated;

-- is_workspace_ghl_connected / is_workspace_jotform_connected DO have real
-- application callers (Integrations page, Form Template Library) that
-- legitimately need authenticated access -- so the fix is an in-body
-- is_workspace_member() check, matching the pattern already used by every
-- other workspace-identifier-accepting function in this project (e.g.
-- search_clients, authorizedWebsite's has_permission call). The existing
-- `authenticated` grant is left in place since both legitimate callers
-- still need it; only the cross-tenant path (an arbitrary p_workspace_id)
-- is closed.
create or replace function public.is_workspace_ghl_connected(p_workspace_id uuid)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not public.is_workspace_member(p_workspace_id) then
    raise exception 'insufficient permissions to view this workspace''s integration status';
  end if;
  return exists (select 1 from public.workspace_ghl_connections where workspace_id = p_workspace_id);
end;
$function$;

create or replace function public.is_workspace_jotform_connected(p_workspace_id uuid)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not public.is_workspace_member(p_workspace_id) then
    raise exception 'insufficient permissions to view this workspace''s integration status';
  end if;
  return exists (select 1 from public.workspace_jotform_connections where workspace_id = p_workspace_id);
end;
$function$;
