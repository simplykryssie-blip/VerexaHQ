-- Replaces the original 27-stage Tax Preparation Pipeline (20260822010000)
-- with the corrected 14-stage structure the user actually wanted, each
-- stage carrying its checklist as process_tasks rows. process_tasks is
-- pre-existing, already-wired infrastructure
-- (20260816194500_instantiate_process_tasks_on_stage_start.sql): when a
-- workflow_stage for a real engagement enters 'In Progress', a trigger
-- copies that stage's process_tasks into real `tasks` rows automatically
-- -- so these checklists become actual staff to-dos the moment an
-- engagement reaches that stage, with no further wiring needed.
--
-- No workflow_runs or engagements exist on this pipeline yet (confirmed),
-- so the old 27 stages can be dropped outright; process_tasks cascades
-- with process_stages and none exist yet either.
do $$
declare
  v_process_id uuid := '7906554d-0cf0-4e50-b79d-66c175c8aac9';
  v_stage_id uuid;
begin
  update public.processes
  set name = 'Individual / Schedule C Tax Preparation Pipeline',
      slug = 'individual-schedule-c-tax-preparation-pipeline'
  where id = v_process_id;

  delete from public.process_stages where process_id = v_process_id;

  -- 1. New Opportunity
  insert into public.process_stages (process_id, name, display_order) values (v_process_id, 'New Opportunity', 0) returning id into v_stage_id;
  insert into public.process_tasks (process_stage_id, name, display_order) values
    (v_stage_id, 'Create/confirm client contact', 0),
    (v_stage_id, 'Identify requested service(s)', 1),
    (v_stage_id, 'Identify tax year', 2),
    (v_stage_id, 'Assign staff owner', 3),
    (v_stage_id, 'Check for existing/open engagement', 4),
    (v_stage_id, 'Send appropriate organizer', 5);

  -- 2. Organizer Required
  insert into public.process_stages (process_id, name, display_order) values (v_process_id, 'Organizer Required', 1) returning id into v_stage_id;
  insert into public.process_tasks (process_stage_id, name, display_order) values
    (v_stage_id, 'Send organizer', 0),
    (v_stage_id, 'Monitor organizer completion', 1),
    (v_stage_id, 'Follow up on incomplete organizer', 2),
    (v_stage_id, 'Confirm organizer submitted', 3);

  -- 3. Organizer Review
  insert into public.process_stages (process_id, name, display_order) values (v_process_id, 'Organizer Review', 2) returning id into v_stage_id;
  insert into public.process_tasks (process_stage_id, name, display_order) values
    (v_stage_id, 'Review completed organizer', 0),
    (v_stage_id, 'Verify requested services', 1),
    (v_stage_id, 'Review tax situation', 2),
    (v_stage_id, 'Review Schedule C/business information', 3),
    (v_stage_id, 'Identify missing information', 4),
    (v_stage_id, 'Determine scope of work', 5),
    (v_stage_id, 'Determine quote', 6),
    (v_stage_id, 'Mark review complete', 7);

  -- 4. Consultation & Quote
  insert into public.process_stages (process_id, name, display_order) values (v_process_id, 'Consultation & Quote', 3) returning id into v_stage_id;
  insert into public.process_tasks (process_stage_id, name, display_order) values
    (v_stage_id, 'Schedule consultation', 0),
    (v_stage_id, 'Review organizer before consultation', 1),
    (v_stage_id, 'Conduct consultation', 2),
    (v_stage_id, 'Confirm services and scope', 3),
    (v_stage_id, 'Finalize quote', 4),
    (v_stage_id, 'Send quote', 5),
    (v_stage_id, 'Record quote decision', 6);

  -- 5. Engagement Pending
  insert into public.process_stages (process_id, name, display_order) values (v_process_id, 'Engagement Pending', 4) returning id into v_stage_id;
  insert into public.process_tasks (process_stage_id, name, display_order) values
    (v_stage_id, 'Prepare engagement letter', 0),
    (v_stage_id, 'Send engagement letter', 1),
    (v_stage_id, 'Monitor engagement letter', 2),
    (v_stage_id, 'Confirm engagement letter completed', 3);

  -- 6. Document & Information Collection
  insert into public.process_stages (process_id, name, display_order) values (v_process_id, 'Document & Information Collection', 5) returning id into v_stage_id;
  insert into public.process_tasks (process_stage_id, name, display_order) values
    (v_stage_id, 'Create required document checklist', 0),
    (v_stage_id, 'Request additional documents', 1),
    (v_stage_id, 'Request additional information', 2),
    (v_stage_id, 'Review submitted documents', 3),
    (v_stage_id, 'Identify missing items', 4),
    (v_stage_id, 'Follow up on missing items', 5),
    (v_stage_id, 'Confirm all required client information received', 6);

  -- 7. Transcript Monitoring
  insert into public.process_stages (process_id, name, display_order) values (v_process_id, 'Transcript Monitoring', 6) returning id into v_stage_id;
  insert into public.process_tasks (process_stage_id, name, display_order) values
    (v_stage_id, 'Request IRS transcripts', 0),
    (v_stage_id, 'Request state transcripts', 1),
    (v_stage_id, 'Monitor transcript requests', 2),
    (v_stage_id, 'Receive transcripts', 3),
    (v_stage_id, 'Review transcripts', 4),
    (v_stage_id, 'Compare transcripts with client information/documents', 5),
    (v_stage_id, 'Resolve discrepancies', 6),
    (v_stage_id, 'Confirm transcript review complete', 7);

  -- 8. Ready for Preparation
  insert into public.process_stages (process_id, name, display_order) values (v_process_id, 'Ready for Preparation', 7) returning id into v_stage_id;
  insert into public.process_tasks (process_stage_id, name, display_order) values
    (v_stage_id, 'Confirm engagement completed', 0),
    (v_stage_id, 'Confirm organizer complete', 1),
    (v_stage_id, 'Confirm required documents received', 2),
    (v_stage_id, 'Confirm required information received', 3),
    (v_stage_id, 'Confirm transcripts received', 4),
    (v_stage_id, 'Confirm transcripts reviewed', 5),
    (v_stage_id, 'Confirm outstanding issues resolved', 6),
    (v_stage_id, 'Assign preparer', 7);

  -- 9. In Preparation
  insert into public.process_stages (process_id, name, display_order) values (v_process_id, 'In Preparation', 8) returning id into v_stage_id;
  insert into public.process_tasks (process_stage_id, name, display_order) values
    (v_stage_id, 'Review prior-year return', 0),
    (v_stage_id, 'Review organizer', 1),
    (v_stage_id, 'Review client documents', 2),
    (v_stage_id, 'Review transcripts', 3),
    (v_stage_id, 'Prepare federal return', 4),
    (v_stage_id, 'Prepare Schedule C', 5),
    (v_stage_id, 'Prepare applicable state return', 6),
    (v_stage_id, 'Enter income', 7),
    (v_stage_id, 'Enter deductions', 8),
    (v_stage_id, 'Enter credits', 9),
    (v_stage_id, 'Review business expenses', 10),
    (v_stage_id, 'Review mileage/vehicle information', 11),
    (v_stage_id, 'Review home-office information', 12),
    (v_stage_id, 'Review assets/depreciation', 13),
    (v_stage_id, 'Resolve preparation questions', 14),
    (v_stage_id, 'Complete tax return', 15),
    (v_stage_id, 'Complete preparation review', 16);

  -- 10. Client Review & Signing
  insert into public.process_stages (process_id, name, display_order) values (v_process_id, 'Client Review & Signing', 9) returning id into v_stage_id;
  insert into public.process_tasks (process_stage_id, name, display_order) values
    (v_stage_id, 'Schedule review consultation', 0),
    (v_stage_id, 'Review prepared return with client', 1),
    (v_stage_id, 'Answer client questions', 2),
    (v_stage_id, 'Make required corrections', 3),
    (v_stage_id, 'Obtain client approval', 4),
    (v_stage_id, 'Send signing documents', 5),
    (v_stage_id, 'Confirm signatures completed', 6);

  -- 11. Ready to File / Filed
  insert into public.process_stages (process_id, name, display_order) values (v_process_id, 'Ready to File / Filed', 10) returning id into v_stage_id;
  insert into public.process_tasks (process_stage_id, name, display_order) values
    (v_stage_id, 'Verify client approval', 0),
    (v_stage_id, 'Verify signatures', 1),
    (v_stage_id, 'Complete final filing review', 2),
    (v_stage_id, 'Confirm filing information', 3),
    (v_stage_id, 'Submit return', 4),
    (v_stage_id, 'Record filing date', 5),
    (v_stage_id, 'Record filing confirmation', 6);

  -- 12. Acceptance & Disbursement Monitoring
  insert into public.process_stages (process_id, name, display_order) values (v_process_id, 'Acceptance & Disbursement Monitoring', 11) returning id into v_stage_id;
  insert into public.process_tasks (process_stage_id, name, display_order) values
    (v_stage_id, 'Monitor federal acceptance', 0),
    (v_stage_id, 'Monitor state acceptance', 1),
    (v_stage_id, 'Address rejection if applicable', 2),
    (v_stage_id, 'Correct and re-file if applicable', 3),
    (v_stage_id, 'Monitor refund/disbursement if applicable', 4),
    (v_stage_id, 'Monitor payment/due date if applicable', 5),
    (v_stage_id, 'Record final filing outcome', 6);

  -- 13. Completed
  insert into public.process_stages (process_id, name, display_order) values (v_process_id, 'Completed', 12) returning id into v_stage_id;
  insert into public.process_tasks (process_stage_id, name, display_order) values
    (v_stage_id, 'Confirm return accepted', 0),
    (v_stage_id, 'Confirm refund/payment status', 1),
    (v_stage_id, 'Deliver final tax documents', 2),
    (v_stage_id, 'Confirm client received final documents', 3),
    (v_stage_id, 'Complete final engagement notes', 4),
    (v_stage_id, 'Close outstanding tasks', 5),
    (v_stage_id, 'Record completion date', 6);

  -- 14. Disengaged
  insert into public.process_stages (process_id, name, display_order) values (v_process_id, 'Disengaged', 13) returning id into v_stage_id;
  insert into public.process_tasks (process_stage_id, name, display_order) values
    (v_stage_id, 'Confirm engagement closed', 0),
    (v_stage_id, 'Confirm no outstanding client items', 1),
    (v_stage_id, 'Confirm all engagement records complete', 2),
    (v_stage_id, 'Close engagement', 3);
end $$;
