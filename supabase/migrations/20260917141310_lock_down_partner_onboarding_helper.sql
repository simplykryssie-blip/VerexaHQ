-- Migration Reconciliation Phase 1.10A -- recovered from production.
--
-- _get_or_create_partner_onboarding is SECURITY DEFINER and returns a plain
-- uuid, so unlike the trigger-return-type fire_*_automations functions, a
-- signed-in or anonymous caller could otherwise manufacture an onboarding
-- row for a workspace they have no relationship to via a direct PostgREST
-- RPC call. Found exploitable during the security review for the
-- partner-purchase-entrypoint change itself. No service_role grant either
-- -- it is only ever called from other SECURITY DEFINER functions, never
-- invoked directly via RPC.
--
-- Confidence: A -- exact original recovered from
-- supabase_migrations.schema_migrations.statements (byte-for-byte).
revoke all on function public._get_or_create_partner_onboarding(uuid, uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public._get_or_create_partner_onboarding(uuid, uuid, uuid, uuid, uuid) from public, anon, authenticated;
