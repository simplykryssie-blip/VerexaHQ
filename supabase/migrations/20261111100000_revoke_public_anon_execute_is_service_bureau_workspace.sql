-- Isolated security-hardening follow-up from the SECURITY DEFINER
-- authorization audit. NOT a functional change -- does not touch the
-- function body, SECURITY DEFINER status, RLS, workspace permissions,
-- roles, or any other function (including Phase 3.2's objects).
--
-- public.is_service_bureau_workspace(p_workspace_id uuid) was created
-- via plain `CREATE FUNCTION` with no explicit REVOKE, so Postgres
-- applied its default grant set: EXECUTE to PUBLIC, inherited by anon.
-- Unlike can_operate_client_book (already hardened in
-- 20261102020000_revoke_public_anon_execute_can_operate_client_book.sql),
-- this function performs *no* internal caller-identity check at all --
-- its body is a single unconditional lookup:
--   select coalesce((select w.workspace_type from public.workspaces w
--     where w.id = p_workspace_id) = 'service_bureau', false);
-- so the anon/PUBLIC grant let any unauthenticated caller enumerate any
-- workspace id's workspace_type (service_bureau or not) -- an
-- unintended cross-tenant information disclosure. This revoke closes
-- that gap. authenticated, postgres, and service_role keep EXECUTE --
-- the function continues to work exactly as before for every real
-- caller.
REVOKE EXECUTE
ON FUNCTION public.is_service_bureau_workspace(uuid)
FROM PUBLIC, anon;
