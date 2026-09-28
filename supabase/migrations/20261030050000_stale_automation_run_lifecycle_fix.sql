-- Suspension/Archive lifecycle hardening, item 7 (stale automation runs
-- created during portal continuity). Reported behavior: a client submits
-- something (organizer response, message, upload) during the intentional
-- Day 0-30 suspended-portal-continuity window. The trigger inserts an
-- automation_runs row (status='running') and calls
-- start_next_automation_step(run_id) in the same transaction. That
-- function's operational gate correctly refuses to execute (the workspace
-- is not active), but it previously did nothing else -- a bare `return`
-- with no record of *why* the run stopped advancing and nothing making it
-- discoverable again. The run stays at status='running' forever, even
-- after the workspace recovers to active, because nothing ever re-invokes
-- start_next_automation_step() for it.
--
-- The same failure mode also existed one level down: if a delayed/
-- approval-gated step (automation_pending_steps, status='pending_delay')
-- became due while the workspace was non-operational, the
-- run-pending-automation-steps cron called execute_automation_step()
-- (whose own gate also bare-returns), then unconditionally deleted the
-- pending_steps row regardless of what happened -- destroying the only
-- durable "waiting to resume" marker for that step.
--
-- Design, after reviewing existing status/resume architecture:
-- start_next_automation_step() is already fully re-entrant -- every call
-- resolves "what's next" purely from automation_runs.current_step_id, the
-- same way the cron already resumes pending_delay/pending_approval steps
-- and the way decide_automation_step/approve_automation_step already
-- resume a paused run. So the correct fix is NOT a new terminal status on
-- automation_runs (running/completed/failed/cancelled all still mean what
-- they already mean -- this run is still genuinely "running", just
-- blocked) and NOT a new value in automation_pending_steps.status either
-- (that table represents "waiting on a specific known next step", which
-- isn't yet known for a just-created run). What's missing is purely
-- discoverability: a way to find "running" runs that stopped advancing
-- because of the operational gate, so something can call
-- start_next_automation_step() again once the workspace recovers.
--
-- Fix: one new nullable timestamp column, set when the gate blocks a run
-- and cleared the moment it passes the gate again (either because the
-- workspace recovered, or because it's a platform-admin-driven run). A log
-- row records the block for auditability, once, not on every re-check. A
-- new phase in run-pending-automation-steps (the existing per-minute
-- automation-advancement cron) resumes any run left blocked once its
-- workspace is active again -- no new cron entry needed. The
-- run-pending-automation-steps cron is also fixed to leave a due
-- pending_delay/pending_approval row untouched (not delete it) when its
-- workspace is non-operational, instead of deleting it unconditionally
-- after an RPC call that silently did nothing.
alter table public.automation_runs add column blocked_at timestamptz;

create or replace function public.start_next_automation_step(p_run_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_run record;
  v_edge record;
  v_next_step_id uuid;
  v_next record;
  v_matched boolean;
  v_has_edges boolean;
  v_current_step_id uuid;
  v_current_step record;
  v_loop_guard int := 0;
  v_wait_mode text;
  v_scheduled_for timestamptz;
  v_approver record;
  v_approval_message text;
  v_retry_started_at timestamptz;
  v_retry_timeout_days int;
begin
  select * into v_run from public.automation_runs where id = p_run_id;
  if v_run.status <> 'running' then
    return;
  end if;

  if not public.is_workspace_operational(v_run.workspace_id) then
    if v_run.blocked_at is null then
      update public.automation_runs set blocked_at = now() where id = p_run_id;
      insert into public.automation_execution_logs (workspace_id, automation_id, engagement_id, workflow_run_id, status, execution_data, error_message, executed_at)
      values (
        v_run.workspace_id, v_run.automation_id, v_run.engagement_id, p_run_id, 'blocked',
        jsonb_build_object('run_id', p_run_id, 'current_step_id', v_run.current_step_id),
        'This workspace is not currently operational -- the run is paused and will resume automatically once the workspace becomes active again.',
        now()
      );
    end if;
    return;
  end if;

  if v_run.blocked_at is not null then
    update public.automation_runs set blocked_at = null where id = p_run_id;
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
        select e.* from public.automation_step_edges e
        join public.automation_steps ts on ts.id = e.to_step_id
        where e.from_step_id = v_current_step_id
          and ts.automation_id = v_run.automation_id
        order by e.sort_order asc
      loop
        if v_edge.branch_conditions is null
           or public.evaluate_automation_conditions(v_edge.branch_conditions, v_run.trigger_snapshot, v_run.workspace_id, v_run.client_id, v_run.engagement_id, v_run.connection_id, v_run.onboarding_id)
        then
          v_next_step_id := v_edge.to_step_id;
          v_matched := true;
          exit;
        end if;
      end loop;

      if not v_matched then
        select exists(
          select 1 from public.automation_step_edges e
          join public.automation_steps ts on ts.id = e.to_step_id
          where e.from_step_id = v_current_step_id and ts.automation_id = v_run.automation_id
        ) into v_has_edges;

        if v_has_edges then
          select * into v_current_step from public.automation_steps where id = v_current_step_id;

          if v_current_step.action_type = 'condition' and coalesce((v_current_step.action_config->>'retry_until_matched')::boolean, false) then
            select created_at into v_retry_started_at
            from public.automation_pending_steps
            where run_id = p_run_id and automation_step_id = v_current_step_id
            order by created_at asc limit 1;

            v_retry_timeout_days := coalesce(nullif(v_current_step.action_config->>'retry_timeout_days', '')::int, 90);

            if v_retry_started_at is null or v_retry_started_at > now() - make_interval(days => v_retry_timeout_days) then
              if v_retry_started_at is null then
                insert into public.automation_pending_steps (workspace_id, run_id, automation_step_id, status, scheduled_for)
                values (v_run.workspace_id, p_run_id, v_current_step_id, 'pending_delay', now());
              end if;
              return;
            end if;
          end if;

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

    if v_next.action_type <> 'condition' and v_next.is_enabled = false then
      insert into public.automation_execution_logs (workspace_id, automation_id, engagement_id, status, execution_data, executed_at)
      values (v_run.workspace_id, v_run.automation_id, v_run.engagement_id, 'completed',
        jsonb_build_object('run_id', p_run_id, 'step_id', v_next.id, 'action_type', v_next.action_type, 'skipped_disabled', true), now());
      v_current_step_id := v_next_step_id;
      continue;
    end if;

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

      v_approval_message := coalesce(nullif(v_next.display_name, ''), initcap(replace(v_next.action_type, '_', ' '))) || ' needs your approval before it runs';

      for v_approver in
        select wu.user_id
        from public.workspace_users wu
        left join public.roles r on r.id = wu.role_id
        where wu.workspace_id = v_run.workspace_id and wu.status = 'active'
          and (
            (v_next.approver_role_id is not null and wu.role_id = v_next.approver_role_id)
            or (v_next.approver_role_id is null and (wu.is_owner or r.slug in ('owner', 'admin')))
          )
      loop
        perform public.create_notification(
          v_run.workspace_id,
          v_approver.user_id,
          'automation',
          'automation-approval-needed',
          jsonb_build_object('message', v_approval_message),
          array['In-App'],
          'High',
          'automation',
          v_run.automation_id
        );
      end loop;
    elsif v_next.action_type = 'business_hours_delay' then
      v_scheduled_for := public.compute_business_hours_deadline(v_run.workspace_id, now(), coalesce(nullif(v_next.action_config->>'hours', '')::numeric, 24));
      insert into public.automation_pending_steps (workspace_id, run_id, automation_step_id, status, scheduled_for)
      values (v_run.workspace_id, p_run_id, v_next.id, 'pending_delay', v_scheduled_for);
    elsif v_wait_mode = 'until_date' then
      v_scheduled_for := nullif(v_next.action_config->>'wait_until_at', '')::timestamptz;
      if v_scheduled_for is null then
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
