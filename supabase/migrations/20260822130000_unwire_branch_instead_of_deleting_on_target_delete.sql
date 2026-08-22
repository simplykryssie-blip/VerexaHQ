-- automation_step_edges.to_step_id had ON DELETE CASCADE, so deleting a
-- step that a condition branch pointed to deleted the branch's edge row
-- entirely (its condition/label included), instead of leaving the branch
-- defined but unwired. The app already expects the latter: addStep()
-- reuses an "unwired branch" (to_step_id is null) when connecting a new
-- step, but that recovery path never ran because the branch was already
-- gone.
alter table public.automation_step_edges
  drop constraint automation_step_edges_to_step_id_fkey,
  add constraint automation_step_edges_to_step_id_fkey
    foreign key (to_step_id) references public.automation_steps(id) on delete set null;
