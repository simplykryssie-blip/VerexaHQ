-- Verexa HQ CRM's real 27-stage Tax Preparation Pipeline, wired to the
-- Individual Tax Return service. process_stages has no
-- organizer_template_id/document_request_template_id/engagement_letter_
-- template_id columns anymore (removed in 20260819131326 -- resolution is
-- strictly per-workspace now), so stage-to-template wiring isn't part of
-- this migration; these are just the named stages in order.
--
-- Two stages carry an explicit "24 business hours" SLA in their name
-- ("Organizer Under Review", "In Preparation"). No business-hours-aware
-- due-date engine exists in this codebase yet -- expected_duration/
-- warning_threshold/critical_threshold are plain intervals that no cron or
-- UI currently reads (confirmed: they only appear in row-cloning code, never
-- in anything that alerts or displays them) -- so expected_duration is set
-- to a plain 24-hour interval on those two stages as the closest available
-- value, and the "24 Business Hours" label stays in the stage name itself
-- since that's the only place it's actually visible to staff today.
do $$
declare
  v_workspace_id uuid := '74321fb2-9a18-4625-ab12-01c98e888667';
  v_service_id uuid := '2df4fcc9-b79a-4d55-8e43-b939a43e3a24';
  v_process_id uuid := gen_random_uuid();
begin
  insert into public.processes (id, workspace_id, name, slug, description, status)
  values (v_process_id, v_workspace_id, 'Tax Preparation Pipeline', 'tax-preparation-pipeline', 'The full individual tax return pipeline, from first opportunity through disengagement.', 'published');

  insert into public.process_stages (process_id, name, display_order, expected_duration) values
  (v_process_id, 'New Opportunity', 0, null),
  (v_process_id, 'Organizer Required', 1, null),
  (v_process_id, 'Organizer Submitted', 2, null),
  (v_process_id, 'Organizer Under Review -- 24 Business Hours', 3, interval '24 hours'),
  (v_process_id, 'Consultation Required', 4, null),
  (v_process_id, 'Quote Sent', 5, null),
  (v_process_id, 'Quote Accepted', 6, null),
  (v_process_id, 'Engagement Letter Sent', 7, null),
  (v_process_id, 'Engagement Pending', 8, null),
  (v_process_id, 'Engagement Completed', 9, null),
  (v_process_id, 'Documents / Information Requested', 10, null),
  (v_process_id, 'Transcripts Requested', 11, null),
  (v_process_id, 'Transcript Monitoring', 12, null),
  (v_process_id, 'Documents + Information Complete', 13, null),
  (v_process_id, 'Transcripts Reviewed', 14, null),
  (v_process_id, 'Ready for Preparation', 15, null),
  (v_process_id, 'In Preparation -- 24 Business Hours', 16, interval '24 hours'),
  (v_process_id, 'Return Ready', 17, null),
  (v_process_id, 'Review Consultation', 18, null),
  (v_process_id, 'Signature Required', 19, null),
  (v_process_id, 'Ready to File', 20, null),
  (v_process_id, 'Filed', 21, null),
  (v_process_id, 'Awaiting Acceptance', 22, null),
  (v_process_id, 'Accepted', 23, null),
  (v_process_id, 'Disbursement / Payment Monitoring', 24, null),
  (v_process_id, 'Completed', 25, null),
  (v_process_id, 'Disengaged', 26, null);

  update public.services set process_id = v_process_id where id = v_service_id;
end $$;
