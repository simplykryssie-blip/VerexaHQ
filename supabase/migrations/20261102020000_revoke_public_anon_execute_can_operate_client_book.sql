-- Isolated security-hardening follow-up to Phase 3.2. NOT a functional
-- change -- does not touch the function body, ero_capability_enabled,
-- any RLS policy, or any of the six Phase 3.2 RPCs.
--
-- public.can_operate_client_book(uuid) was created via plain `CREATE
-- FUNCTION` with no explicit REVOKE, so Postgres applied its default
-- grant set: EXECUTE to PUBLIC, which is inherited by every role
-- including anon. This differs from the existing internal authorization
-- helpers it was modeled on (has_permission, is_workspace_operational,
-- is_workspace_member), which are all restricted to authenticated,
-- postgres, and service_role -- none of them grant to anon or PUBLIC.
--
-- Because can_operate_client_book is SECURITY DEFINER and bypasses RLS,
-- the broader-than-intended grant let an anonymous, unauthenticated
-- caller invoke it directly against any workspace id and learn whether
-- that workspace is a service_bureau with the capability flag on or off.
-- This revoke brings it in line with its sibling helpers. authenticated,
-- postgres, and service_role keep EXECUTE -- the function still works
-- exactly as before for every real caller (RLS policies, and the six
-- Phase 3.2 RPCs, all of which run under authenticated or service_role
-- context).
REVOKE EXECUTE
ON FUNCTION public.can_operate_client_book(uuid)
FROM PUBLIC, anon;
