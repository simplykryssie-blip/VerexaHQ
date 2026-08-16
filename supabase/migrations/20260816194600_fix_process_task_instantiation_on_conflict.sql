-- The ON CONFLICT clause in instantiate_process_tasks_for_stage() didn't
-- match tasks_workflow_stage_process_task_uidx: a partial unique index's
-- WHERE predicate must be repeated verbatim in ON CONFLICT for Postgres to
-- recognize it as the arbiter. Caught immediately via a live test (creating
-- a real engagement against the Individual Tax pipeline, rolled back).

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
  on conflict (workflow_stage_id, process_task_id) where process_task_id is not null do nothing;

  return new;
end;
$function$;
