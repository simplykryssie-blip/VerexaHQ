-- process_tasks (task templates authored per pipeline stage in the
-- Pipelines/Service builder) were never actually turned into real tasks.
-- start_engagement_workflow() copies process_stages -> workflow_stages when
-- a pipeline starts, but nothing ever read process_tasks at all -- the
-- "template" half of the feature existed, the "instantiate" half didn't.
--
-- This adds that instantiation, hooked to the same event
-- fire_workflow_stage_entered_automations() already uses: a workflow_stage
-- transitioning to 'In Progress' (both the first stage, set directly by
-- start_engagement_workflow, and every later stage, set by
-- advance_workflow_on_stage_completed).

alter table public.tasks
  add column if not exists process_task_id uuid references public.process_tasks(id) on delete set null;

-- Backs the ON CONFLICT below so re-firing the trigger (e.g. a stage
-- re-entered after being reopened) never creates duplicate tasks for the
-- same template task on the same stage instance.
create unique index if not exists tasks_workflow_stage_process_task_uidx
  on public.tasks (workflow_stage_id, process_task_id)
  where process_task_id is not null;

create or replace function public.instantiate_process_tasks_for_stage()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_engagement_id uuid;
  v_workspace_id uuid;
  v_stage_started_at timestamptz;
begin
  if new.status <> 'In Progress' or old.status is not distinct from 'In Progress' then
    return new;
  end if;
  if new.process_stage_id is null then
    return new;
  end if;

  select wr.engagement_id, wr.workspace_id into v_engagement_id, v_workspace_id
  from public.workflow_runs wr where wr.id = new.workflow_run_id;

  if v_engagement_id is null then
    return new;
  end if;

  v_stage_started_at := coalesce(new.started_at, now());

  -- due_date_rule and assignee_role_id aren't exposed in the Pipelines
  -- builder UI yet (StageEditor.tsx only edits name/description/required),
  -- so in practice both are usually empty -- handled here defensively so
  -- authoring them later (directly or via a future UI) just works:
  --   due_date_rule: {"days_after_stage_start": <int>}
  --   assignee_role_id: resolved to whichever active staff member in this
  --     workspace holds that role (the workspace owner wins ties), since a
  --     process task names a role, not a specific person.
  insert into public.tasks (
    workspace_id, engagement_id, workflow_stage_id, process_task_id,
    title, description, priority, due_date, assigned_staff_id, status
  )
  select
    v_workspace_id,
    v_engagement_id,
    new.id,
    pt.id,
    pt.name,
    pt.description,
    'medium',
    case when (pt.due_date_rule ->> 'days_after_stage_start') is not null
      then v_stage_started_at + make_interval(days => (pt.due_date_rule ->> 'days_after_stage_start')::int)
      else null
    end,
    (
      select wu.user_id
      from public.workspace_users wu
      where wu.workspace_id = v_workspace_id
        and wu.role_id = pt.assignee_role_id
        and wu.status = 'active'
      order by wu.is_owner desc, wu.created_at asc
      limit 1
    ),
    'pending'
  from public.process_tasks pt
  where pt.process_stage_id = new.process_stage_id
  on conflict (workflow_stage_id, process_task_id) do nothing;

  return new;
end;
$function$;

drop trigger if exists trg_instantiate_process_tasks_for_stage on public.workflow_stages;
create trigger trg_instantiate_process_tasks_for_stage
  after update of status on public.workflow_stages
  for each row execute function public.instantiate_process_tasks_for_stage();
