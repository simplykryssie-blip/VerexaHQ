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
-- Fixes a real bug found in testing: the Missing Info Reminder
-- automation's delay step had action_config.delay_unit set (display
-- metadata only) but never got the actual delay_minutes column set --
-- it defaulted to 0, so start_next_automation_step() executed straight
-- through it with no wait at all, making the reminder fire and its
-- follow-up condition evaluate in the same instant instead of after a
-- real wait. Sets it to 1 day (1440 minutes), matching the unit already
-- declared in its own action_config.
update public.automation_steps
set delay_minutes = 1440
where id = '3516039b-6874-41c5-9b7e-4937eb502753';
