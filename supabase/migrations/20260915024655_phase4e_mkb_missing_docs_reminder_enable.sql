-- ============================================================================
-- MIGRATION RECONCILIATION PHASE 1.9 -- RECOVERED FROM PRODUCTION (PR #268)
--
-- Did not previously exist in Git main. Applied directly to production
-- during the MKB Tax Prep + Client Review + F1/F2/NW-1 security work
-- (PR #268, branch claude/verexa-schema-mismatch-i8c19u, never merged).
-- This filename's version already exactly matches the real recorded
-- production version in supabase_migrations.schema_migrations -- no rename
-- needed. Content verified byte-for-byte (modulo a single trailing
-- newline) against schema_migrations.statements. Confidence: A -- exact
-- original recovered.
-- ============================================================================
-- Phase 4E-A audit finding: migration 20260914232227 created MKB's
-- "Individual/Sched C -- Missing Info Reminder" automation with
-- is_enabled = false, but live MKB has it at is_enabled = true -- flipped
-- during testing (after the edge/delay-minutes repairs proved it works)
-- via an action with no corresponding migration. This records that final,
-- verified-working state so replaying migrations from scratch reproduces
-- it. Scoped to this exact automation id (already verified live) and this
-- exact workspace, so it cannot affect any other automation or workspace.
-- Safe to re-run if already enabled (no-op).
update public.automations
set is_enabled = true
where id = '24a4209d-bb8e-44ca-865a-dc3baaeec5f8'
  and workspace_id = '2896bf43-95db-420f-9bb5-8854f537bbd1';
