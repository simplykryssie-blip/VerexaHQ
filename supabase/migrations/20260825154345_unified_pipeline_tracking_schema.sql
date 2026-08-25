-- Unify lead-pipeline tracking (lead_pipeline_runs/lead_pipeline_stages) and
-- engagement-pipeline tracking (workflow_runs/workflow_stages) into one
-- polymorphic mechanism, so one pipeline definition can carry a case from
-- "lead expressed interest" all the way through "engagement delivered"
-- without staff building two separate pipelines and stitching them
-- together by hand. Follows the entity_type/entity_id convention already
-- used by notes/document_folders/irs_notices: workspace_id denormalized
-- (RLS never resolves it through entity_id), entity_id has no FK since it
-- can point at either clients or engagements.
--
-- Engagements genuinely use per-stage history today (SLA badges, the
-- progress bar), leads don't -- so pipeline_stages keeps the richer
-- workflow_stages shape (assignment, due dates, durations, SLA), just
-- nullable for lead-side stages.
create table public.pipeline_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  entity_type text not null check (entity_type in ('client', 'engagement')),
  entity_id uuid not null,
  process_id uuid not null references public.processes(id) on delete cascade,
  status workflow_run_status not null default 'Active',
  current_stage_id uuid,
  started_at timestamptz default now(),
  completed_at timestamptz,
  paused_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table public.pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  pipeline_run_id uuid not null references public.pipeline_runs(id) on delete cascade,
  -- Denormalized from the parent run (and kept in sync whenever a run is
  -- handed off from client to engagement) so RLS never has to join up to
  -- pipeline_runs to know which permission set applies.
  entity_type text not null check (entity_type in ('client', 'engagement')),
  process_stage_id uuid not null references public.process_stages(id) on delete cascade,
  stage_name text not null,
  display_order int not null,
  status workflow_stage_status not null default 'Pending',
  assigned_staff_id uuid references public.user_profiles(id),
  reviewer_id uuid references public.user_profiles(id),
  started_at timestamptz,
  completed_at timestamptz,
  due_date timestamptz,
  estimated_duration interval,
  actual_duration interval,
  sla_status text,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.pipeline_runs
  add constraint pipeline_runs_current_stage_fkey foreign key (current_stage_id) references public.pipeline_stages(id) on delete set null;

-- Generalizes the fix already shipped for leads (concurrent_lead_pipeline_runs_per_service.sql):
-- a client or engagement still can't have two Active runs in the SAME
-- pipeline, but concurrent runs in different pipelines are allowed. This
-- also closes a real gap found on the engagement side today -- workflow_runs
-- has no such guard at all.
create unique index pipeline_runs_one_active_idx on public.pipeline_runs (entity_type, entity_id, process_id) where (status = 'Active'::workflow_run_status);
create index pipeline_runs_workspace_idx on public.pipeline_runs (workspace_id);
create index pipeline_runs_entity_idx on public.pipeline_runs (entity_type, entity_id);
create index pipeline_runs_process_idx on public.pipeline_runs (process_id);
create index pipeline_runs_current_stage_idx on public.pipeline_runs (current_stage_id);

create index pipeline_stages_run_idx on public.pipeline_stages (pipeline_run_id);
create index pipeline_stages_workspace_idx on public.pipeline_stages (workspace_id);
create index pipeline_stages_process_stage_idx on public.pipeline_stages (process_stage_id);

alter table public.pipeline_runs enable row level security;
alter table public.pipeline_stages enable row level security;

-- Mirrors lead_pipeline_runs' clients.view/clients.edit and workflow_runs'
-- engagements.view/engagements.manage, branching on entity_type. No
-- INSERT/DELETE policies -- exactly like lead_pipeline_runs today, every
-- write goes through SECURITY DEFINER functions (start_pipeline_run,
-- advance_pipeline_stage, execute_automation_step's actions), which bypass
-- RLS as owned by postgres. The one direct client-side write
-- (StageReviewActions.tsx's plain UPDATE) is covered by the UPDATE policy.
create policy pipeline_runs_select on public.pipeline_runs for select using (
  case entity_type
    when 'client' then has_permission(workspace_id, 'clients.view')
    when 'engagement' then has_permission(workspace_id, 'engagements.view')
    else false
  end
);
create policy pipeline_runs_update on public.pipeline_runs for update using (
  case entity_type
    when 'client' then has_permission(workspace_id, 'clients.edit')
    when 'engagement' then has_permission(workspace_id, 'engagements.manage')
    else false
  end
);

create policy pipeline_stages_select on public.pipeline_stages for select using (
  case entity_type
    when 'client' then has_permission(workspace_id, 'clients.view')
    when 'engagement' then has_permission(workspace_id, 'engagements.view')
    else false
  end
);
create policy pipeline_stages_update on public.pipeline_stages for update using (
  case entity_type
    when 'client' then has_permission(workspace_id, 'clients.edit')
    when 'engagement' then has_permission(workspace_id, 'engagements.manage') or (( select auth.uid() ) = assigned_staff_id)
    else false
  end
) with check (
  case entity_type
    when 'client' then has_permission(workspace_id, 'clients.edit')
    when 'engagement' then has_permission(workspace_id, 'engagements.manage') or (( select auth.uid() ) = assigned_staff_id)
    else false
  end
);

-- Replaces matching a stage by its hardcoded display name (fragile -- a
-- rename silently breaks e-file auto-skip logic and in-flight runs whose
-- stage_name was frozen at run-start). Nullable and extensible; only the
-- two roles used by today's e-file branching exist for now.
alter table public.process_stages add column stage_role text check (stage_role in ('efile_decision', 'efile_rejected'));

update public.process_stages set stage_role = 'efile_decision' where name = 'Filed / Awaiting Acceptance';
update public.process_stages set stage_role = 'efile_rejected' where name = 'Rejected / Correction Needed';
