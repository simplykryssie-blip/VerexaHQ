-- Pipelines removal: the manual drag-and-drop pipeline feature had 0 engagements
-- ever placed on it (verified live). It's superseded by the Service board
-- (/pipelines route now renders workflow_runs/process_stages instead), so the
-- pipelines/pipeline_stages tables and the engagements columns that pointed at
-- them are dropped. The pipeline_stage_changed automation trigger type goes
-- with it since it depended on pipeline_stage_id.

drop trigger if exists trg_fire_pipeline_stage_automations on engagements;
drop function if exists fire_pipeline_stage_automations();

drop trigger if exists trg_sync_engagement_pipeline_from_stage on engagements;
drop function if exists sync_engagement_pipeline_from_stage();

drop function if exists ensure_default_pipeline(uuid);

alter table engagements drop column if exists pipeline_id;
alter table engagements drop column if exists pipeline_stage_id;

-- services.pipeline_id predates this session's Pipelines UI (pre-existing,
-- unused scaffolding, never read by any app code) -- drops along with it.
alter table services drop column if exists pipeline_id;

drop table if exists pipeline_stages;
drop table if exists pipelines;
