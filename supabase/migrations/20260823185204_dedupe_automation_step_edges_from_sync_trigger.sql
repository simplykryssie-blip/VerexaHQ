-- automation_steps_sync_edges auto-links every step sequentially by
-- display_order until the automation has a condition step, then goes
-- inert. Both new automations built in this batch insert their steps
-- across several statements with the condition step created midway
-- through (or, for "Lead Stalled- No Organizer", never) -- so the trigger
-- auto-created its own null-branch/null-label linear edges for the early
-- steps *before* my own explicit edge inserts ran, producing exact
-- duplicate rows (same from/to/sort_order) for those pairs. Harmless to
-- execution (evaluate_automation_conditions/start_next_automation_step
-- just evaluate the first matching edge), but confusing in the workflow
-- builder UI, which would render two arrows on top of each other.
delete from public.automation_step_edges a
using public.automation_step_edges b
where a.automation_id in ('a1cedcb0-6e33-4ed0-9a5e-322684f9b7d2', '3556bcce-fe13-4217-a07f-96cbfe2097ff')
  and a.automation_id = b.automation_id
  and a.from_step_id = b.from_step_id
  and a.to_step_id = b.to_step_id
  and a.sort_order = b.sort_order
  and a.id > b.id;
