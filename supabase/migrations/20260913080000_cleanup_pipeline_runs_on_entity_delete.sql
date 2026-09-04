-- pipeline_runs.entity_id is a polymorphic reference (entity_type = 'client'
-- or 'engagement') so it can't carry a normal foreign key with ON DELETE
-- CASCADE. Deleting a client or engagement -- through the app or directly in
-- the database -- left its pipeline_runs row behind, still "Active" and
-- pointing at nothing, which blocks deleting the pipeline itself (the
-- delete_workflow_pipeline RPC refuses while any run is still active). These
-- triggers clean up the matching pipeline_runs row whenever the entity it
-- tracks is deleted, from any deletion path, not just the app's own RPCs.

create or replace function public.cleanup_pipeline_runs_on_engagement_delete()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  delete from public.pipeline_runs where entity_type = 'engagement' and entity_id = old.id;
  return old;
end;
$$;

create trigger trg_cleanup_pipeline_runs_on_engagement_delete
after delete on public.engagements
for each row execute function public.cleanup_pipeline_runs_on_engagement_delete();

create or replace function public.cleanup_pipeline_runs_on_client_delete()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  delete from public.pipeline_runs where entity_type = 'client' and entity_id = old.id;
  return old;
end;
$$;

create trigger trg_cleanup_pipeline_runs_on_client_delete
after delete on public.clients
for each row execute function public.cleanup_pipeline_runs_on_client_delete();

-- One-time cleanup of the 3 already-orphaned "Active" runs found in the MKB
-- Financial Group workspace, pointing at engagements that no longer exist.
delete from public.pipeline_runs
where id in (
  '8f3b9597-46e1-4018-b2a8-cc5186caf680',
  '886be19e-9c18-46ec-afdd-ae9f9f7a3d41',
  '5758a131-9650-4a51-b252-e6d271c999be'
);
