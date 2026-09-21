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
-- Phase 4E: MKB Financial Group's Tax Prep pipeline -- ONE continuous
-- pipeline per the Phase 4D-C/4E-A architecture decision, not the
-- Summit/MKB-historical two-process split. Stage order is chosen so every
-- forward transition automations/RPCs need (move_pipeline_stage and
-- advance_pipeline_stage both forbid moving backward -- confirmed live)
-- is actually forward: Declined - ERO Review sits just after Missing
-- Docs/Information (reachable from either Organizer Under Review or
-- Missing Docs), and Declined Filing sits just after Client Review
-- (reachable only from there). The revision loop (Client Review <->
-- staff revises) deliberately does not re-enter Preparation Started as a
-- stage -- see the Phase 4E-A design note; it stays parked at Client
-- Review and cycles engagements.status instead, the same proven pattern
-- already used by the Missing Docs reminder loop (which never backs out
-- of its own stage either).
do $$
declare
  v_workspace_id uuid := '2896bf43-95db-420f-9bb5-8854f537bbd1';
  v_process_id uuid := gen_random_uuid();
begin
  insert into public.processes (id, workspace_id, name, slug, description, status)
  values (
    v_process_id, v_workspace_id,
    'Individual/ Schedule C Tax Prep Pipeline',
    'individual-schedule-c-tax-prep-pipeline',
    'The complete Individual/Schedule C tax preparation lifecycle, from lead through filing/completion, as one continuous pipeline.',
    'published'
  );

  insert into public.process_stages (process_id, name, display_order) values
    (v_process_id, 'Lead', 0),
    (v_process_id, 'Organizer Under Review', 1),
    (v_process_id, 'Missing Docs/Information', 2),
    (v_process_id, 'Declined - ERO Review', 3),
    (v_process_id, 'Ready for Preparation', 4),
    (v_process_id, 'Preparation Started', 5),
    (v_process_id, 'Client Review', 6),
    (v_process_id, 'Declined Filing', 7),
    (v_process_id, 'Filed/Completed', 8);

  update public.services
  set process_id = v_process_id
  where id = 'f0526ed4-5927-42c1-8fd9-eb019eb386ee'
    and workspace_id = v_workspace_id;
end $$;
