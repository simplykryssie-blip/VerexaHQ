-- Found while answering a question about how lead-pipeline stage moves
-- work: No-Show Follow-Up's first action was move_lead_stage targeting
-- "Consult Needed" (display_order 2), but a no-show lead is sitting in
-- "Consult Booked" (display_order 3) when this fires. Both the manual
-- stage control and the move_lead_stage automation action enforce
-- forward-only moves by design (see advance_lead_pipeline_stage and
-- execute_automation_step) -- this step would raise "Moving a lead
-- backward through pipeline stages is not supported" every time it ran.
-- Since it fires from an AFTER UPDATE trigger on appointments.status, that
-- exception would have rolled back the entire transaction -- staff
-- wouldn't have been able to mark the appointment "no_show" at all, not
-- just failed to run the automation.
--
-- Pipeline stage tracks furthest point reached, not current disposition;
-- a no-show doesn't actually need to rewind it. The consult:no-show tag
-- and follow-up task already carry that signal for staff to act on.
-- Removes the stage-move step and reconnects the condition step straight
-- to the message steps.
update public.automation_step_edges
set to_step_id = '67adc99f-cfa5-43ff-8805-3ebc70bff237'
where automation_id = '96227c33-2472-4420-8fec-302aa8c465cc'
  and from_step_id = 'b02a1e7a-d10b-4caa-88d9-80198c447958'
  and label = 'None';

delete from public.automation_step_edges
where automation_id = '96227c33-2472-4420-8fec-302aa8c465cc'
  and from_step_id = '645d22d2-1e1b-437f-a5cd-17de7d7cfe4b';

delete from public.automation_steps
where id = '645d22d2-1e1b-437f-a5cd-17de7d7cfe4b';
