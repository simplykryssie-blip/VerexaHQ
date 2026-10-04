-- Summit Tax & Financial Services' "Individual/Sched C" pipeline automations
-- were rebuilt by 20260912000000_reclone_mkb_config_into_ptin_demo.sql from
-- MKB Financial Group's own config. That migration correctly cloned the
-- pipeline processes/stages into Summit's own new rows and correctly rewired
-- every automation's move_pipeline_stage ACTION to target Summit's new
-- stage ids -- but left the TRIGGER side (lead.stage_entered's
-- process_id/process_stage_id, organizer.submitted's organizer_template_id)
-- pointed at MKB's original, still-live ids instead of Summit's cloned
-- equivalents.
--
-- fire_lead_stage_entered_automations() matches purely on
-- `trigger_config ->> 'process_stage_id' = new.process_stage_id::text`
-- (supabase/migrations/20260825155059_unified_pipeline_functions_triggers_views.sql)
-- and fire_organizer_submitted_automations() matches on
-- `trigger_config ->> 'organizer_template_id' = NEW.organizer_template_id::text`
-- (supabase/migrations/20260824000000_organizer_submitted_moves_pipeline_immediately.sql).
-- Since MKB's ids never equal Summit's real fired ids, these 10 automations
-- silently never fire -- a client's card visually advances through the
-- pipeline (the move_pipeline_stage actions use valid Summit ids), but none
-- of the emails/texts/tasks/ERO handoffs/document requests tied to entering
-- each of those stages, or to organizer submission, ever go out.
--
-- Confirmed via fresh_platform-wide-scan.sql-equivalent live query that no
-- other automation, in any workspace, has this class of cross-workspace
-- trigger reference -- this is isolated to these 10 rows.
--
-- Mapping (by automation name matched to Summit's actual current stage
-- names -- see process_stages for 043d74b3-61f7-4fb1-8977-5c48a456e687
-- "Individual/ Sched C Onboarding" and a06576f8-38a8-4621-9382-a71ac4759a81
-- "Individual/ Sched C Prep Started"):
update public.automations set trigger_config = '{"process_id":"043d74b3-61f7-4fb1-8977-5c48a456e687","process_stage_id":"d1140411-a8c4-4f40-a33f-c1d270ba2e73"}'::jsonb where id = '307e83c0-e785-457e-8c11-5256e19e93ca'; -- Missing Info -> Missing Docs/ Information
update public.automations set trigger_config = '{"process_id":"043d74b3-61f7-4fb1-8977-5c48a456e687","process_stage_id":"f9c4a3d5-3d7f-4cb5-b5e3-bc57913f71f5"}'::jsonb where id = '3ab3846e-a570-4bc5-9fc5-b6cb2ab4eaf5'; -- Ready for Prep -> Ready for Preparation
update public.automations set trigger_config = '{"process_id":"043d74b3-61f7-4fb1-8977-5c48a456e687","process_stage_id":"0d879800-8e51-4eba-8f4b-cf1680d8f38e"}'::jsonb where id = '512f8cba-fcb6-4d5b-9b34-08dfb27fa412'; -- ERO Review Declined -> Declined - ERO Review
update public.automations set trigger_config = '{"process_id":"043d74b3-61f7-4fb1-8977-5c48a456e687","process_stage_id":"3f47fb3e-ba07-45dc-8849-4ed31e3dd337"}'::jsonb where id = '2984be41-844d-443f-b9a4-b4688170bb52'; -- Needs ERO Review -> Organizer Under Review

update public.automations set trigger_config = '{"process_id":"a06576f8-38a8-4621-9382-a71ac4759a81","process_stage_id":"7477717c-ab58-4caa-8825-4c56559908b9"}'::jsonb where id = '3ee9668d-fc47-4246-9951-642a331b26fe'; -- Client Review Needs Revision -> Client Review- Needs Revision
update public.automations set trigger_config = '{"process_id":"a06576f8-38a8-4621-9382-a71ac4759a81","process_stage_id":"d3448eac-b016-4ee3-a0e6-126a1c0a0f79"}'::jsonb where id = '23a47665-6d7f-45b1-b664-107f090bb89f'; -- Client Review Approved -> Client Review- Completed/ Approved
update public.automations set trigger_config = '{"process_id":"a06576f8-38a8-4621-9382-a71ac4759a81","process_stage_id":"91343720-9160-4afc-8872-5b6ba0dbdbb7"}'::jsonb where id = 'ef895376-b622-4e1e-b6a4-cf68ff1ec915'; -- Client Review Declined Filing -> Client Review- Declined Filing
update public.automations set trigger_config = '{"process_id":"a06576f8-38a8-4621-9382-a71ac4759a81","process_stage_id":"d79fe1c8-e72e-4292-829e-8e52640af37e"}'::jsonb where id = '58a6870e-666a-4667-9a29-b8ff06d878c5'; -- Preparation Started -> Preparation Started
update public.automations set trigger_config = '{"process_id":"a06576f8-38a8-4621-9382-a71ac4759a81","process_stage_id":"ff88cf8e-da2c-4c8f-ad2b-25831ed9fdaa"}'::jsonb where id = '2b677e51-c799-45b5-a092-28bd3178f823'; -- Schedule Review Appointment -> Schedule Review Appointment

-- organizer.submitted: MKB's organizer_template_id -> Summit's own; the
-- conditions clause embeds the same id in "<template_id>|submitted" form.
update public.automations
set trigger_config = '{"organizer_template_id":"68d8af0a-272c-48c3-bc76-0e72a6d2b4c7"}'::jsonb,
    conditions = '[{"conditions":[{"op":"eq","field":"client.organizer_status","value":"68d8af0a-272c-48c3-bc76-0e72a6d2b4c7|submitted"}]}]'::jsonb
where id = '679131dd-7a87-462f-99ab-69814ec776e2';
