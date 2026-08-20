-- Bug found while verifying the corrected Individual Tax pipeline: an
-- engagement.created automation that uses the change_stage action fails
-- with "no active pipeline stage to advance." Root cause is trigger
-- ordering, not the automation itself -- create_engagement() inserts the
-- engagement row, and trg_fire_engagement_created_automations (a plain
-- AFTER INSERT trigger) fires synchronously at the end of that INSERT
-- statement, which is *before* create_engagement()'s next line calls
-- start_engagement_workflow() to create the workflow_runs/workflow_stages
-- rows. So any engagement.created automation that touches the pipeline
-- (change_stage) runs before the pipeline exists.
--
-- This never surfaced before because the only engagement.created
-- automation that existed just sent an engagement letter -- it never
-- touched workflow_stages. Recreating the trigger as a deferrable
-- constraint trigger (initially deferred) makes it fire at transaction
-- commit instead, by which point start_engagement_workflow has already
-- run in the same transaction. No behavior change for any other
-- automation type; this is the only engagement.created trigger in the
-- system.
drop trigger trg_fire_engagement_created_automations on public.engagements;

create constraint trigger trg_fire_engagement_created_automations
  after insert on public.engagements
  deferrable initially deferred
  for each row execute function public.fire_engagement_created_automations();
