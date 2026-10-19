-- Isolated ACL-hardening follow-up to
-- 20261102050000_backfill_capture_public_mkb_business_inquiry.sql. NOT a
-- functional change -- does not touch the function body, SECURITY
-- DEFINER, search_path, RLS, or any other function.
--
-- capture_public_mkb_business_inquiry(...) is an intentional public
-- endpoint: anon and authenticated EXECUTE are both required and must
-- remain (its real caller is embedded JavaScript on the published MKB
-- Financial Group Contact page, calling it directly via the Supabase
-- REST endpoint as an unauthenticated visitor). But because the backfill
-- migration created this function fresh on staging (it already existed
-- on production), Postgres applied its default grant there -- EXECUTE to
-- PUBLIC, which production never had. This revoke removes only that one
-- extra grant, bringing staging's ACL back in line with production's
-- intentional model: anon, authenticated, postgres, service_role -- no
-- PUBLIC. On production, where PUBLIC was never granted, this REVOKE is
-- a harmless no-op.
REVOKE EXECUTE
ON FUNCTION public.capture_public_mkb_business_inquiry(
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text
)
FROM PUBLIC;
