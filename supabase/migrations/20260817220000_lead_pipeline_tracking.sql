-- Leads can't use the existing workflow_runs/workflow_stages tracking
-- (workflow_runs.engagement_id is NOT NULL -- that system only starts once
-- create_engagement() exists, which a lead by definition doesn't have yet).
-- That's why "Move the lead to a pipeline stage" fell back to the separate,
-- uncustomizable lead_stages list instead of a real pipeline built in the
-- Pipelines builder. This adds a parallel, client-scoped run/stage pair
-- mirroring workflow_runs/workflow_stages exactly, so a lead can move
-- through any published pipeline the same way an engagement does, and
-- rewires move_lead_stage (now targets a real process_id/process_stage_id
-- instead of lead_stage_key) and change_stage (now also handles a
-- client-scoped run when there's no engagement) to use it.

create table public.lead_pipeline_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  process_id uuid not null references public.processes(id) on delete cascade,
  status text default 'Active' check (status in ('Active', 'Completed', 'Cancelled')),
  current_stage_id uuid,
  started_at timestamptz default now(),
  completed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index lead_pipeline_runs_client_idx on public.lead_pipeline_runs (client_id);
create index lead_pipeline_runs_workspace_idx on public.lead_pipeline_runs (workspace_id);
-- One active pipeline per lead at a time, same constraint the automation
-- action logic assumes when deciding whether to start a new run or advance
-- the existing one.
create unique index lead_pipeline_runs_one_active_idx on public.lead_pipeline_runs (client_id) where status = 'Active';

create table public.lead_pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  lead_pipeline_run_id uuid not null references public.lead_pipeline_runs(id) on delete cascade,
  process_stage_id uuid not null references public.process_stages(id) on delete cascade,
  stage_name text not null,
  display_order integer not null,
  status public.workflow_stage_status default 'Pending',
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index lead_pipeline_stages_run_idx on public.lead_pipeline_stages (lead_pipeline_run_id, display_order);

alter table public.lead_pipeline_runs add constraint lead_pipeline_runs_current_stage_fkey
  foreign key (current_stage_id) references public.lead_pipeline_stages(id) on delete set null;

alter table public.lead_pipeline_runs enable row level security;
alter table public.lead_pipeline_stages enable row level security;

create policy lead_pipeline_runs_select on public.lead_pipeline_runs for select
using (public.has_permission(workspace_id, 'clients.view'));
create policy lead_pipeline_runs_update on public.lead_pipeline_runs for update
using (public.has_permission(workspace_id, 'clients.edit'));

create policy lead_pipeline_stages_select on public.lead_pipeline_stages for select
using (public.has_permission(workspace_id, 'clients.view'));
create policy lead_pipeline_stages_update on public.lead_pipeline_stages for update
using (public.has_permission(workspace_id, 'clients.edit'));

-- Mirrors start_engagement_workflow: create the run, copy every stage from
-- the process template, and auto-start the first one.
create or replace function public.start_lead_pipeline_run(p_client_id uuid, p_process_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_run_id uuid;
  v_workspace_id uuid;
begin
  select workspace_id into v_workspace_id from public.clients where id = p_client_id;
  if v_workspace_id is null then
    raise exception 'client not found';
  end if;

  insert into public.lead_pipeline_runs (workspace_id, client_id, process_id, status, started_at)
  values (v_workspace_id, p_client_id, p_process_id, 'Active', now())
  returning id into v_run_id;

  insert into public.lead_pipeline_stages (workspace_id, lead_pipeline_run_id, process_stage_id, stage_name, display_order)
  select v_workspace_id, v_run_id, id, name, display_order
  from public.process_stages
  where process_id = p_process_id
  order by display_order asc;

  update public.lead_pipeline_runs
  set current_stage_id = (select id from public.lead_pipeline_stages where lead_pipeline_run_id = v_run_id order by display_order asc limit 1)
  where id = v_run_id;

  update public.lead_pipeline_stages
  set status = 'In Progress', started_at = now()
  where id = (select current_stage_id from public.lead_pipeline_runs where id = v_run_id);

  return v_run_id;
end;
$function$;

-- Mirrors advance_workflow_on_stage_completed, without the engagement-only
-- e-file branching that trigger also handles -- a lead has no
-- engagement_tax_details yet.
create or replace function public.advance_lead_pipeline_on_stage_completed()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_next_stage_id uuid;
begin
  select id into v_next_stage_id
  from public.lead_pipeline_stages
  where lead_pipeline_run_id = new.lead_pipeline_run_id
    and display_order > new.display_order
    and status not in ('Completed', 'Skipped')
  order by display_order asc
  limit 1;

  if v_next_stage_id is not null then
    update public.lead_pipeline_runs set current_stage_id = v_next_stage_id where id = new.lead_pipeline_run_id;
    update public.lead_pipeline_stages set status = 'In Progress', started_at = now() where id = v_next_stage_id;
  else
    update public.lead_pipeline_runs set status = 'Completed', completed_at = now() where id = new.lead_pipeline_run_id;
  end if;

  return new;
end;
$function$;

create trigger trg_advance_lead_pipeline_on_stage_completed
after update on public.lead_pipeline_stages
for each row when (new.status in ('Completed', 'Skipped') and old.status is distinct from new.status)
execute function public.advance_lead_pipeline_on_stage_completed();
