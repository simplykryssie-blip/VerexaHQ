-- Gap #2 from the GHL capability audit: the "delay" step could only wait a
-- fixed duration ("wait 2 days"), never "wait until X happens" or "wait
-- until a specific date/time" -- both real GHL capabilities. Scoped here to
-- a literal absolute date/time for the date mode (a dynamic "N days before
-- this date field" mode belongs with the future business-hours due-date
-- engine, not duplicated here) and an arbitrary condition list, reusing the
-- same ConditionsEditor/evaluate_automation_conditions machinery every
-- other condition in this app already uses, for the condition mode.
--
-- action_config for a 'delay' step gains an optional wait_mode:
--   'duration' (default, unchanged) -- existing delay_minutes behavior.
--   'until_date' -- scheduled_for is action_config->>'wait_until_at' directly.
--   'until_condition' -- scheduled_for is "now" (checked on the very next
--     cron tick), and re-checked on every tick after via
--     should_advance_wait_until_step() until action_config->'wait_conditions'
--     evaluates true or action_config->>'wait_timeout_days' (default 30)
--     has elapsed since the step started waiting, whichever comes first.

CREATE OR REPLACE FUNCTION public.start_next_automation_step(p_run_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_run record;
  v_edge record;
  v_next_step_id uuid;
  v_next record;
  v_matched boolean;
  v_has_edges boolean;
  v_current_step_id uuid;
  v_loop_guard int := 0;
  v_wait_mode text;
  v_scheduled_for timestamptz;
begin
  select * into v_run from public.automation_runs where id = p_run_id;
  if v_run.status <> 'running' then
    return;
  end if;

  v_current_step_id := v_run.current_step_id;

  loop
    v_loop_guard := v_loop_guard + 1;
    if v_loop_guard > 200 then
      insert into public.automation_execution_logs (workspace_id, automation_id, engagement_id, status, execution_data, error_message, executed_at)
      values (v_run.workspace_id, v_run.automation_id, v_run.engagement_id, 'failed',
        jsonb_build_object('run_id', p_run_id, 'step_id', v_current_step_id),
        'This workflow''s branches form a loop that never reaches an action step (possible cycle). Stopped after 200 steps to avoid running forever.',
        now());
      update public.automation_runs set status = 'failed', completed_at = now() where id = p_run_id;
      return;
    end if;

    if v_current_step_id is null then
      select s.id into v_next_step_id
      from public.automation_steps s
      where s.automation_id = v_run.automation_id
        and not exists (select 1 from public.automation_step_edges e where e.to_step_id = s.id)
      order by s.display_order asc
      limit 1;

      if v_next_step_id is null then
        update public.automation_runs set status = 'completed', completed_at = now() where id = p_run_id;
        return;
      end if;
    else
      v_matched := false;
      v_next_step_id := null;
      for v_edge in
        select * from public.automation_step_edges
        where from_step_id = v_current_step_id
        order by sort_order asc
      loop
        if v_edge.branch_conditions is null
           or public.evaluate_automation_conditions(v_edge.branch_conditions, v_run.trigger_snapshot, v_run.workspace_id, v_run.client_id, v_run.engagement_id)
        then
          v_next_step_id := v_edge.to_step_id;
          v_matched := true;
          exit;
        end if;
      end loop;

      if not v_matched then
        select exists(select 1 from public.automation_step_edges where from_step_id = v_current_step_id) into v_has_edges;
        if v_has_edges then
          insert into public.automation_execution_logs (workspace_id, automation_id, engagement_id, status, execution_data, executed_at)
          values (v_run.workspace_id, v_run.automation_id, v_run.engagement_id, 'completed',
            jsonb_build_object('run_id', p_run_id, 'step_id', v_current_step_id, 'dead_end', true, 'reason', 'no branch matched and no default edge'),
            now());
        end if;
        update public.automation_runs set status = 'completed', completed_at = now() where id = p_run_id;
        return;
      end if;

      if v_next_step_id is null then
        insert into public.automation_execution_logs (workspace_id, automation_id, engagement_id, status, execution_data, executed_at)
        values (v_run.workspace_id, v_run.automation_id, v_run.engagement_id, 'completed',
          jsonb_build_object('run_id', p_run_id, 'step_id', v_current_step_id, 'unwired_branch', true, 'reason', 'the matching branch has not been connected to a next step yet'),
          now());
        update public.automation_runs set status = 'completed', completed_at = now() where id = p_run_id;
        return;
      end if;
    end if;

    select * into v_next from public.automation_steps where id = v_next_step_id;
    update public.automation_runs set current_step_id = v_next_step_id where id = p_run_id;

    if v_next.action_type = 'condition' and v_next.delay_minutes = 0 then
      insert into public.automation_execution_logs (workspace_id, automation_id, engagement_id, status, execution_data, executed_at)
      values (v_run.workspace_id, v_run.automation_id, v_run.engagement_id, 'completed',
        jsonb_build_object('run_id', p_run_id, 'step_id', v_next.id, 'action_type', 'condition'), now());
      v_current_step_id := v_next_step_id;
      continue;
    end if;

    v_wait_mode := case when v_next.action_type = 'delay' then coalesce(v_next.action_config->>'wait_mode', 'duration') else 'duration' end;

    if v_next.requires_approval then
      insert into public.automation_pending_steps (workspace_id, run_id, automation_step_id, status)
      values (v_run.workspace_id, p_run_id, v_next.id, 'pending_approval');
    elsif v_wait_mode = 'until_date' then
      v_scheduled_for := nullif(v_next.action_config->>'wait_until_at', '')::timestamptz;
      if v_scheduled_for is null then
        -- No date configured -- proceed rather than waiting forever on nothing.
        perform public.execute_automation_step(p_run_id, v_next.id);
      else
        insert into public.automation_pending_steps (workspace_id, run_id, automation_step_id, status, scheduled_for)
        values (v_run.workspace_id, p_run_id, v_next.id, 'pending_delay', v_scheduled_for);
      end if;
    elsif v_wait_mode = 'until_condition' then
      insert into public.automation_pending_steps (workspace_id, run_id, automation_step_id, status, scheduled_for)
      values (v_run.workspace_id, p_run_id, v_next.id, 'pending_delay', now());
    elsif v_next.delay_minutes > 0 then
      insert into public.automation_pending_steps (workspace_id, run_id, automation_step_id, status, scheduled_for)
      values (v_run.workspace_id, p_run_id, v_next.id, 'pending_delay', now() + make_interval(mins => v_next.delay_minutes));
    else
      perform public.execute_automation_step(p_run_id, v_next.id);
    end if;
    return;
  end loop;
end;
$function$;

-- Called by the cron before advancing a pending_delay row: for a plain
-- duration or until_date wait, scheduled_for arriving is itself sufficient
-- (returns true unconditionally). For until_condition, actually evaluates
-- the stored condition list against the run's current state, or gives up
-- and advances anyway once the timeout has elapsed.
CREATE OR REPLACE FUNCTION public.should_advance_wait_until_step(p_pending_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_pending record;
  v_step record;
  v_run record;
  v_wait_mode text;
  v_timeout_days int;
begin
  select * into v_pending from public.automation_pending_steps where id = p_pending_id;
  if v_pending.id is null then
    return true;
  end if;

  select * into v_step from public.automation_steps where id = v_pending.automation_step_id;
  v_wait_mode := case when v_step.action_type = 'delay' then coalesce(v_step.action_config->>'wait_mode', 'duration') else 'duration' end;

  if v_wait_mode <> 'until_condition' then
    return true;
  end if;

  v_timeout_days := coalesce(nullif(v_step.action_config->>'wait_timeout_days', '')::int, 30);
  if v_pending.created_at < now() - make_interval(days => v_timeout_days) then
    return true;
  end if;

  select * into v_run from public.automation_runs where id = v_pending.run_id;

  return public.evaluate_automation_conditions(
    v_step.action_config->'wait_conditions',
    v_run.trigger_snapshot,
    v_run.workspace_id,
    v_run.client_id,
    v_run.engagement_id
  );
end;
$function$;
