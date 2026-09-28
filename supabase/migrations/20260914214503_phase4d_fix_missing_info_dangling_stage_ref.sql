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
-- Phase 4D Part 3: "Individual/Sched C -- Missing Info" (307e83c0,
-- disabled) checks lead.process_stage_id = f73e3103-181c-4201-8f0c-
-- 2eee042c2209 at all 4 of its reminder check-ins to decide "has the
-- client resolved this / did staff move them out of Missing Docs, or do
-- we send the next reminder". That stage id has never existed in the
-- live database (to_regclass-equivalent lookup on process_stages
-- confirms 0 rows) -- proven via migration history
-- (20260913010000_mkb_individual_sched_c_review_decision_automations.sql)
-- to have been MKB Financial Group's own "Missing Docs/Information"
-- stage under their copy of this process; MKB's workspace no longer
-- exists (cascade-deleted, along with the stage). Because eq against a
-- value no stage can ever equal is permanently false, the "still
-- missing, send next reminder" branch of every check-in is unreachable,
-- and because lead.process_stage_id resolves from a CLIENT-level
-- pipeline run (this automation fires on an ENGAGEMENT-level stage
-- entry, and Summit's real usage of this process is 13 engagement-level
-- runs vs 1 client-level), a working id here still wouldn't track the
-- right axis for this workspace.
--
-- Fix: field lead.process_stage_id -> engagement.process_stage_id (a
-- confirmed-working generic field already resolving via p_engagement_id,
-- which fire_pipeline_stage_entered_automations already passes into this
-- automation's runs), value f73e3103... -> d1140411-a8c4-4f40-a33f-
-- c1d270ba2e73 (Summit's own real "Missing Docs/ Information" stage
-- under 043d74b3). This makes "is the engagement still sitting in
-- Missing Docs/Information" the actual, correct check -- exactly the
-- signal a new organizer_response.review_decided routing decision
-- (Phase 4C) produces the moment staff re-reviews and moves the
-- engagement elsewhere. No field, no engine, no schema change --
-- automation stays disabled.
update public.automation_step_edges
set branch_conditions = '[{"conditions":[{"op":"eq","field":"engagement.process_stage_id","value":"d1140411-a8c4-4f40-a33f-c1d270ba2e73"}]}]'::jsonb
where id in (
  'ec4312d8-f458-4d82-ac13-c26b85fc9d8d',
  '8236a80d-e462-4a54-a952-c5c416a267f7',
  '52ae0890-4e2c-410f-97a9-d6b7df2969f8',
  '8202e0e7-211f-4e1d-b3b5-247e72bc5c62'
);

update public.automation_step_edges
set branch_conditions = '[{"conditions":[{"op":"neq","field":"engagement.process_stage_id","value":"d1140411-a8c4-4f40-a33f-c1d270ba2e73"}]}]'::jsonb
where id in (
  '6628970c-4378-42c6-ac3c-4c09204984c2',
  '43031680-9289-44a0-bb63-014191f986ff',
  'd526978c-859d-4521-9e1b-41ebd1603590',
  '7448e26f-24f8-47dd-8827-be4250b77f20'
);
