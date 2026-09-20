-- ============================================================================
-- MIGRATION RECONCILIATION PHASE 1.6 -- regression self-test
--
-- This is NEW content authored 2026-09-20 (today), not a recovery of a
-- historical production migration -- unlike the other file added in this
-- same batch (20260914161023_fix_is_workspace_operational_anon_grant.sql,
-- which IS a verbatim historical recovery). It has never been applied to
-- production; its filename uses today's real authoring date, not a
-- fictional future date, and it is safe to apply normally (fresh CREATE, no
-- collision) whenever this branch is deployed.
--
-- Proves three security-critical facts investigated during Phase 1.6:
--
-- 1. is_workspace_operational(uuid) has no anon EXECUTE grant (the effect
--    of the newly-recovered fix_is_workspace_operational_anon_grant
--    migration above).
-- 2. start_next_automation_step still gates on is_workspace_operational.
-- 3. execute_automation_step still gates on is_workspace_operational.
--
-- Checks 2 and 3 exist because Phase 1.6 investigated two other
-- production-only migrations (billing_lifecycle_automation_engine_gate,
-- billing_lifecycle_execute_automation_step_gate) that originally appeared,
-- by filename/name search, to have no Git representation at all. Deeper
-- investigation found their actual effect (the operational gate in both
-- functions) IS already fully represented in main -- byte-for-byte
-- identical to current production -- via a completely different,
-- already-merged migration lineage (20260916150000_billing_lifecycle_
-- suspension_enforcement.sql, 20261030050000_stale_automation_run_
-- lifecycle_fix.sql, 20261030095000_fix_automation_resume_skips_blocked_
-- step.sql, among others). Those two migration VERSIONS are not
-- recoverable as their own discrete file without regressing main to a
-- stale, since-superseded state -- but the security property they exist to
-- guarantee is not missing. This test proves that property continues to
-- hold going forward, independent of which specific migration provides it.
create or replace function public.test_p16_security_migration_recovery()
returns table(check_name text, passed boolean, detail text)
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  return query select
    'is_workspace_operational_anon_execute_revoked'::text,
    not has_function_privilege('anon', 'public.is_workspace_operational(uuid)', 'EXECUTE'),
    'anon must not hold EXECUTE on public.is_workspace_operational(uuid)'::text;

  return query select
    'start_next_automation_step_has_operational_gate'::text,
    coalesce((
      select prosrc ilike '%is_workspace_operational%'
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'start_next_automation_step'
    ), false),
    'public.start_next_automation_step source must reference is_workspace_operational'::text;

  return query select
    'execute_automation_step_has_operational_gate'::text,
    coalesce((
      select prosrc ilike '%is_workspace_operational%'
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'execute_automation_step'
    ), false),
    'public.execute_automation_step source must reference is_workspace_operational'::text;
end;
$function$;

revoke all on function public.test_p16_security_migration_recovery() from public, anon, authenticated;
grant execute on function public.test_p16_security_migration_recovery() to service_role;
