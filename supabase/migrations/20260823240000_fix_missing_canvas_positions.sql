-- Root cause of "these workflows don't make sense": every step added
-- through the visual builder gets a canvas_x/canvas_y (dragged there by
-- hand or auto-placed by positionForNewStep). Every step added today via
-- raw SQL migrations never got one -- canvas_x/canvas_y stayed null. The
-- canvas's own fallback for a null position, autoPosition(i) in
-- WorkflowCanvas.tsx, just does { x: 300, y: 140 + i*160 } keyed off
-- array index, completely ignoring the real branching graph -- so every
-- step added via SQL rendered stacked on top of unrelated,
-- already-positioned nodes instead of following its actual place in the
-- flow. Fixing that is a one-time backfill; nothing about the runtime
-- logic changes.
--
-- New Leads Enter CRM's reminder chain (16-19) also pushed steps 13/14
-- (move to stalled pipeline, start the stalled automation) one level
-- deeper in the graph than they used to be -- their existing position
-- (set when they were built directly under the first recheck) now sits
-- *above* the reminder chain that logically comes before them, so those
-- two move down too, not just the brand-new steps.

do $$
declare
  v_new_leads_id uuid := 'f0cf2f59-df2f-438d-b501-9d0c535f0e5b';
  v_followup_id uuid := 'a1cedcb0-6e33-4ed0-9a5e-322684f9b7d2';
  v_stalled_id uuid := '3556bcce-fe13-4217-a07f-96cbfe2097ff';
begin
  -- New Leads Enter CRM: continue the right-hand "still pending" column
  -- (x=547, matching steps at display_order 11/12 already there) downward
  -- through the reminder + second wait + second recheck, then move
  -- 13/14 down below that. The shared "organizer completed" merge step
  -- (20, start_workflow into Organizer Completed Follow-up) sits at the
  -- bottom so all three resolution points -- the initial condition (4),
  -- the first recheck (12), and the second recheck (19) -- point down and
  -- across into it, never upward.
  update public.automation_steps set canvas_x = 547, canvas_y = 1190 where automation_id = v_new_leads_id and display_order = 16; -- reminder email
  update public.automation_steps set canvas_x = 547, canvas_y = 1280 where automation_id = v_new_leads_id and display_order = 17; -- reminder sms
  update public.automation_steps set canvas_x = 547, canvas_y = 1370 where automation_id = v_new_leads_id and display_order = 18; -- second 24h wait
  update public.automation_steps set canvas_x = 547, canvas_y = 1460 where automation_id = v_new_leads_id and display_order = 19; -- second recheck condition
  update public.automation_steps set canvas_x = 547, canvas_y = 1570 where automation_id = v_new_leads_id and display_order = 13; -- move to stalled pipeline (was 1218, now one level deeper)
  update public.automation_steps set canvas_x = 547, canvas_y = 1660 where automation_id = v_new_leads_id and display_order = 14; -- start Lead Stalled- No Organizer (was 1324)
  update public.automation_steps set canvas_x = 270, canvas_y = 1780 where automation_id = v_new_leads_id and display_order = 20; -- shared merge: start Organizer Completed Follow-up

  -- Organizer Completed Follow-up: straight line down to the escalation
  -- condition, then branches -- "Unassigned" continues straight down (the
  -- expected/common path when the clock actually fires), "Already
  -- Assigned" (no escalation needed) branches right.
  update public.automation_steps set canvas_x = 300, canvas_y = 100 where automation_id = v_followup_id and display_order = 0; -- notify staff
  update public.automation_steps set canvas_x = 300, canvas_y = 190 where automation_id = v_followup_id and display_order = 1; -- move to service pipeline
  update public.automation_steps set canvas_x = 300, canvas_y = 280 where automation_id = v_followup_id and display_order = 2; -- 24 business-hour wait
  update public.automation_steps set canvas_x = 300, canvas_y = 370 where automation_id = v_followup_id and display_order = 3; -- unassigned? condition
  update public.automation_steps set canvas_x = 300, canvas_y = 460 where automation_id = v_followup_id and display_order = 4; -- escalate (Unassigned)
  update public.automation_steps set canvas_x = 550, canvas_y = 460 where automation_id = v_followup_id and display_order = 5; -- no-op note (Already Assigned)

  -- Lead Stalled- No Organizer: purely linear.
  update public.automation_steps set canvas_x = 300, canvas_y = 100 where automation_id = v_stalled_id and display_order = 0; -- create task
  update public.automation_steps set canvas_x = 300, canvas_y = 190 where automation_id = v_stalled_id and display_order = 1; -- notify staff
  update public.automation_steps set canvas_x = 300, canvas_y = 280 where automation_id = v_stalled_id and display_order = 2; -- tag
end $$;
