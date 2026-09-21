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
-- Phase 4D Part 4: "Individual/Sched C -- Ready for Prep" (3ab3846e,
-- disabled) re-sends the same organizer the client just completed to get
-- approved (organizer_template_id 51d0c196..., the Individual/Sched C
-- intake form) the moment the quote is accepted -- serving no purpose
-- and needlessly re-prompting an already-reviewed client. This removes
-- only that one send_organizer_template step (28e2a5bc), rerouting the
-- "quote accepted" edge directly to the existing next step (the
-- "preparation_has_begun" email, ebda844a) that was already going to run
-- right after it. Every other step -- including the automation's final
-- move_pipeline_stage into process a06576f8 "Individual/Sched C Prep
-- Started" -- is left untouched: that process is still actively wired
-- (5 other enabled-eligible automations reference its real stages, all
-- deliberately re-pointed at Summit's own ids in the same cleanup pass
-- that fixed this automation's trigger_config), so it is NOT proven to
-- be dead/legacy and is not this phase's call to remove -- see the
-- Phase 4D report's Part 6 recommendation (product decision needed).
-- Automation stays disabled.
update public.automation_step_edges
set to_step_id = 'ebda844a-8d5c-420a-937f-c9e9634397f5'
where id = 'eced5bf8-a505-44d3-876e-cdd59df375d9';

delete from public.automation_step_edges
where id = '73cd6c48-f9fa-4315-9f2b-61a5298bd850';

delete from public.automation_steps
where id = '28e2a5bc-12db-4db0-8459-0b0aa8fec766';
