-- Redo the Individual Tax Prep (Individual/Schedule C) pipeline to match
-- the same clean, consistent stage pattern just built for the other 8
-- pipelines (Business Tax Prep, Bookkeeping, Amendments, Payroll,
-- Business Services, Tax Planning, Extensions, Consulting & Advisory).
-- It was deliberately left untouched in the prior migration but its old
-- 14-stage list (New Opportunity, Organizer Required, Organizer Review,
-- Consultation & Quote, Engagement Pending, Document & Information
-- Collection, Transcript Monitoring, Ready for Preparation, In
-- Preparation, Client Review & Signing, Ready to File / Filed,
-- Acceptance & Disbursement Monitoring, Completed, Disengaged) and its
-- ~100 stage-level checklist task templates are inconsistent with every
-- other pipeline in the catalog and don't match how the rest of intake
-- now works (no other pipeline has stage-level task templates).
--
-- Mirrors Business Tax Prep Pipeline's stage list exactly, since Schedule
-- C is filed as part of an individual (1040) return -- same workflow
-- shape as business tax prep, just for an individual filer.
--
-- Zero engagements are on this pipeline today (confirmed live), so this
-- is a safe drop-and-rebuild: deleting process_stages cascades to
-- process_tasks (confdeltype 'c') and lead_pipeline_stages, and
-- workflow_stages has zero rows referencing these stage ids.

do $$
declare
  v_process_id uuid := '7906554d-0cf0-4e50-b79d-66c175c8aac9';
  v_stage_names text[] := array['Lead', 'Engagement Letter Signed', 'Organizer Sent', 'Documents Received', 'Preparation', 'Internal Review', 'Client Approval', 'E-Filed', 'Accepted', 'Invoiced', 'Closed'];
  v_i int;
begin
  update public.processes
  set name = 'Individual Tax Prep Pipeline', slug = 'individual-tax-prep-pipeline'
  where id = v_process_id;

  delete from public.process_stages where process_id = v_process_id;

  for v_i in 1 .. array_length(v_stage_names, 1) loop
    insert into public.process_stages (process_id, name, display_order) values (v_process_id, v_stage_names[v_i], v_i - 1);
  end loop;
end $$;
