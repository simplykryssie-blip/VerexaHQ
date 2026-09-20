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
-- Fixes a real bug found in testing: the Missing Info Reminder automation
-- (24a4209d-bb8e-44ca-865a-dc3baaeec5f8) was created with its condition
-- step's two branch edges but never got the two linear edges connecting
-- its first three steps (send_notification -> delay -> condition). With
-- no edge at all leaving send_notification, start_next_automation_step()
-- treated it as a true dead end and marked the whole run 'completed'
-- immediately after the first step, never reaching the delay/condition/
-- escalation logic at all. Adds the two missing edges.
insert into public.automation_step_edges (automation_id, from_step_id, to_step_id, sort_order)
values
  ('24a4209d-bb8e-44ca-865a-dc3baaeec5f8', '9a0129de-8351-4232-b02b-66781b0f72be', '3516039b-6874-41c5-9b7e-4937eb502753', 0),
  ('24a4209d-bb8e-44ca-865a-dc3baaeec5f8', '3516039b-6874-41c5-9b7e-4937eb502753', '6fadb1d5-cd5e-4e2d-8052-fe6026653040', 0);
