-- task.overdue is structurally different from every other automation
-- trigger so far: it's not a discrete database event (an INSERT/UPDATE),
-- it's "time has passed a due_date while nothing else changed" -- so it
-- needs a periodic scan (cron) rather than a row-level trigger, following
-- the same shape as enqueue_reminder_notifications (also cron-driven,
-- also idempotent via a dedupe mechanism) rather than the
-- fire_*_automations trigger functions used everywhere else.
--
-- overdue_flagged_at is a one-time flag (same pattern as
-- clients.portal_basic_info_completed_at): the scan only considers tasks
-- where it's still null, and sets it once fired, so a task stuck overdue
-- for weeks fires its automation exactly once, not every time the cron
-- runs.
alter table public.tasks add column overdue_flagged_at timestamptz;

create or replace function public.fire_task_overdue_automations()
returns int
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  r record;
  v_automation record;
  v_context jsonb;
  v_run_id uuid;
  v_count int := 0;
begin
  for r in
    select t.id, t.workspace_id, t.engagement_id, t.title, t.due_date, e.client_id
    from public.tasks t
    join public.engagements e on e.id = t.engagement_id
    where t.status <> 'completed'
      and t.due_date is not null
      and t.due_date < now()
      and t.overdue_flagged_at is null
  loop
    v_context := jsonb_build_object('task_id', r.id, 'title', r.title, 'due_date', r.due_date);

    for v_automation in
      select * from public.automations
      where workspace_id = r.workspace_id and is_enabled = true and status = 'published'
        and trigger_type = 'task.overdue'
    loop
      if public.evaluate_automation_conditions(v_automation.conditions, v_context) then
        insert into public.automation_runs (workspace_id, automation_id, engagement_id, client_id, trigger_snapshot, status)
        values (r.workspace_id, v_automation.id, r.engagement_id, r.client_id, v_context, 'running')
        returning id into v_run_id;
        perform public.start_next_automation_step(v_run_id);
      end if;
    end loop;

    update public.tasks set overdue_flagged_at = now() where id = r.id;
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$function$;
