-- Removes the "default lead pipeline" concept entirely, platform-wide, at
-- the user's explicit request ("I want it deleted if it's pointless. I
-- hate extra stuff that serves no purpose but taking up space").
--
-- It turned out to be pointless: move_lead_stage (the automation action
-- every lead-routing automation uses) already lazily starts a lead's
-- pipeline run itself, using the process_id hardcoded in that automation
-- step's own config, the first time it actually needs to move that lead --
-- completely independent of this workspace-level setting. The setting's
-- only real effect was auto-dropping a brand-new lead onto a pipeline's
-- "New" stage before any automation had run, which nothing actually
-- depended on.
--
-- Removed: the auto-start-on-create trigger/function, and the
-- workspaces.default_lead_process_id column/toggle. The underlying lead
-- pipeline system itself (lead_pipeline_runs, lead_pipeline_stages,
-- start_lead_pipeline_run, advance_lead_pipeline_stage, the
-- move_lead_stage automation action, the lead.stage_entered trigger) is
-- untouched -- that's a real, functioning mechanism, just no longer gated
-- behind a single designated "default" pipeline.
drop trigger if exists trg_auto_start_lead_pipeline_on_create on public.clients;
drop function if exists public.auto_start_lead_pipeline_on_create();

alter table public.workspaces drop column if exists default_lead_process_id;
