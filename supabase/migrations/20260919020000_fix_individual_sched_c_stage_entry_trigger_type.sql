-- The 9 "Individual/Sched C" stage-entry automations (ERO review, client
-- review approve/decline/revise, missing-docs follow-up, ready-for-prep,
-- preparation-started, schedule-review-appointment) were all wired to
-- trigger_type = 'lead.stage_entered'. fire_pipeline_stage_entered_automations()
-- only fires 'lead.stage_entered' automations when the pipeline run's
-- entity_type = 'client', and 'engagement.stage_entered' otherwise -- but
-- every real pipeline_run reaching these specific stages in the live demo
-- data is entity_type = 'engagement' (Individual/Sched C prep is inherently
-- post-engagement-creation: there's a real return to review by this point,
-- not a lead being nurtured). Confirmed live: all 9 automations have zero
-- automation_runs rows, ever -- so there is no working client-side firing
-- path this could break; every historical pipeline_stages row at these
-- stages that happened to be entity_type = 'client' never actually fired
-- either (0 runs), so switching trigger_type is a pure fix, not a tradeoff.
-- Found by the first Verexa Workflow Agent run.

update public.automations
set trigger_type = 'engagement.stage_entered'
where workspace_id = 'b41f7ee8-e811-4d4d-8156-5ebf43014462'
  and trigger_type = 'lead.stage_entered'
  and trigger_config ? 'process_stage_id'
  and name ilike 'Individual/Sched C%';
