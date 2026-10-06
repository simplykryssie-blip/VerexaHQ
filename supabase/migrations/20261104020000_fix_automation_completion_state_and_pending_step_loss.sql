-- P08-01 / P08-02 -- Automation completion-state reliability.
--
-- P08-01 (false completion): start_next_automation_step() collapsed three
-- distinct abnormal-termination shapes into automation_runs.status =
-- 'completed', indistinguishable from a genuine successful completion in
-- every dashboard/retry/UI path that exists today:
--   1. No resolvable entry step (fresh run, no step without an incoming
--      edge) -- previously not even logged.
--   2. Dead end: the current step has outgoing edges, but none of their
--      branch_conditions matched and there is no default edge -- previously
--      logged with execution_data.dead_end = true but the LOG ROW'S OWN
--      status was 'completed', and automation_runs was marked 'completed'.
--   3. Unwired branch: a branch matched, but its edge's to_step_id is null
--      (edge FK is ON DELETE SET NULL, or the branch was never wired to a
--      destination in the builder) -- same 'completed' pattern, where this
--      code path was reached at all.
--
-- A second, deeper defect in shape 3 was found while writing the local
-- harness test for it: the edge-resolution query (both the branch-matching
-- loop and the v_has_edges check) INNER joins to automation_steps on
-- to_step_id. An edge whose to_step_id is null is therefore invisible to
-- both queries, not merely mismatched -- it's silently treated as if the
-- edge doesn't exist at all. sync_automation_step_edges() only rewires the
-- narrow unconditional-in/unconditional-out case when a step is deleted; a
-- conditional branch's destination being deleted, a step with no outgoing
-- edge being deleted, or a condition-type step being deleted (that trigger
-- returns immediately for action_type='condition') all leave a real
-- edge row with to_step_id = null in production data today. Previously that
-- row was simply never considered, so a step whose only branch is unwired
-- this way looked exactly like a true leaf (v_has_edges = false) --
-- indistinguishable from legitimate completion, with no log row at all.
-- This is actually the same false-completion bug as shapes 1/2, just via a
-- different mechanism, and is fixed here by changing both queries to a
-- LEFT JOIN (keeping the to_step_id IS NULL rows, scoping the automation_id
-- check to only the rows that do have a destination), so an unwired edge is
-- now correctly seen and handled by the existing unwired_branch logic
-- instead of silently vanishing.
--
-- Confirmed via live code/data inspection: get_platform_failed_automation_runs
-- (20260905140000_it_command_center_foundation.sql) filters status='failed'
-- only, so all three shapes are invisible to the platform "Failed Automation
-- Runs" dashboard; retry_failed_automation_run() rejects anything that isn't
-- status='failed', so even a staff member who found one manually couldn't
-- retry it; RunDetailPanel.tsx renders status='completed' as plain
-- "Completed" with no check of execution_data.dead_end/.unwired_branch.
--
-- Fix: reuse the EXISTING status model (running/completed/failed/cancelled)
-- rather than add a new enum value. All three abnormal shapes above now end
-- in automation_runs.status = 'failed' with a clear error_message and the
-- same execution_data markers as before (dead_end/unwired_branch, plus a new
-- no_entry_step marker for shape 1). This makes every three of them
-- immediately visible to get_platform_failed_automation_runs,
-- retry_failed_automation_run, and RunDetailPanel's existing "Failed"
-- rendering with ZERO changes needed to any of those three -- they already
-- key off status='failed'. The one genuinely LEGITIMATE completion shape
-- that looks superficially similar -- a step with no outgoing edges
-- configured at all (v_has_edges = false), i.e. an intentional leaf/end of
-- the graph -- is unchanged and still marks 'completed', exactly as before.
-- end_workflow and ordinary end-of-graph (no entry step edge case aside)
-- are also unchanged.
--
-- P08-02 (pending-step loss), two parts:
--
--   a) Caller-side: app/api/cron/run-pending-automation-steps/route.ts calls
--      should_advance_wait_until_step / start_next_automation_step /
--      execute_automation_step and discards any RPC error entirely, then
--      unconditionally deletes the automation_pending_steps row -- "the only
--      durable 'still waiting' marker" (the route's own comment) -- even
--      when the RPC never actually ran. Fixed in the application code in
--      this same change (not here): every RPC result's `error` is now
--      checked; the pending row is deleted only when the RPC returned
--      without error. A partial, already-shipped fix for the specific
--      "workspace not operational" cause (20261030050000) is preserved
--      unchanged -- that cause still takes the "leave the row in place"
--      branch via its own pre-check, same as before.
--
--   b) Root cause: start_next_automation_step() had NO exception handler at
--      all. Any uncaught error inside it (a malformed branch_conditions
--      jsonb breaking evaluate_automation_conditions, or any other runtime
--      error) propagated as a raw Postgres error -- and because the whole
--      RPC call is one implicit transaction, that rolled back everything
--      the call had done, INCLUDING the automation_execution_logs insert
--      that would have explained what happened. The failure erased its own
--      evidence before the caller-side fix in (a) could even see a durable
--      row to preserve on *future* ticks (the row itself might already be
--      gone from report (a)'s own prior successful processing on a *later*
--      step in the same cascade). Fixed by wrapping the step-resolution loop
--      in begin/exception/end, mirroring the pattern execute_automation_step
--      already uses for its own action-type switch: any unexpected error is
--      now caught, logged (execution_data.unexpected_error = true,
--      error_message = sqlerrm), and the run is marked 'failed' -- a normal,
--      auditable outcome, not a silent rollback. Because this handler lives
--      inside start_next_automation_step itself, it also covers the
--      function's recursive invocation from execute_automation_step's own
--      tail call (`perform start_next_automation_step(p_run_id)`), so an
--      error while advancing past an action step is caught at that exact
--      point too, without needing any change to execute_automation_step.
--
-- retry_failed_automation_run() is updated to match: a run whose latest
-- failed-status execution log carries dead_end/unwired_branch/
-- no_entry_step/unexpected_error is a "couldn't resolve the next step"
-- failure and must be retried via start_next_automation_step(), not by
-- re-running the already-completed current step via execute_automation_step
-- (which would silently re-execute that step's action a second time). An
-- ordinary action failure (no such marker) is retried exactly as before.
-- The old guard rejecting a null current_step_id is removed -- a run that
-- failed to resolve an entry step at all (current_step_id is null) is now a
-- legitimate retry target too.
--
-- Out of scope (explicitly, per this round's authorization): the
-- synchronous organizer-submission -> automation-resolution transaction
-- coupling, and the pending-step concurrent-processing/duplicate-execution
-- risk. Both are documented as separate follow-up findings, not remediated
-- here.

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
      insert into public.automation_execution_logs (workspace_id, automation_id, engagement_id, workflow_run_id, status, execution_data, error_message, executed_at)
      values (
        v_run.workspace_id, v_run.automation_id, v_run.engagement_id, p_run_id, 'blocked',
        jsonb_build_object('run_id', p_run_id, 'current_step_id', v_run.current_step_id),
        'This workspace is not currently operational -- the run is paused and will resume automatically once the workspace becomes active again.',
        now()
      );
    end if;
    -- No blocked_step_id here: current_step_id is already-completed work at
    -- this point (or null, for a fresh run), not a not-yet-executed step, so
    -- resuming by re-resolving "what's next" from it is safe.
    update public.automation_runs set blocked_at = coalesce(blocked_at, now()), blocked_step_id = null where id = p_run_id;
    return;
  end if;

  if v_run.blocked_at is not null then
    update public.automation_runs set blocked_at = null, blocked_step_id = null where id = p_run_id;
  end if;

  v_current_step_id := v_run.current_step_id;

  -- P08-02(b): any unexpected error anywhere in step resolution below (and,
  -- via the recursive call this loop makes into execute_automation_step and
  -- back, anything that happens while advancing past an action step too) is
  -- caught here instead of propagating out and rolling back its own
  -- evidence. See the migration header for the full rationale.
  begin
    loop
      v_loop_guard := v_loop_guard + 1;
      if v_loop_guard > 200 then
        insert into public.automation_execution_logs (workspace_id, automation_id, engagement_id, workflow_run_id, status, execution_data, error_message, executed_at)
        values (v_run.workspace_id, v_run.automation_id, v_run.engagement_id, p_run_id, 'failed',
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
          -- P08-01 shape 1: no resolvable entry step. This is always a
          -- configuration problem (an automation with no steps, or a graph
          -- where every step has an incoming edge), never a legitimate
          -- outcome, so it's a failure now -- previously not even logged.
          insert into public.automation_execution_logs (workspace_id, automation_id, engagement_id, workflow_run_id, status, execution_data, error_message, executed_at)
          values (v_run.workspace_id, v_run.automation_id, v_run.engagement_id, p_run_id, 'failed',
            jsonb_build_object('run_id', p_run_id, 'no_entry_step', true, 'reason', 'no starting step could be resolved for this automation'),
            'This automation has no resolvable starting step (no step without an incoming edge was found).',
            now());
          update public.automation_runs set status = 'failed', completed_at = now() where id = p_run_id;
          return;
        end if;
      else
        v_matched := false;
        v_next_step_id := null;
        -- Left join (not the original inner join): an edge whose
        -- to_step_id is null (its destination step was deleted -- the FK is
        -- ON DELETE SET NULL, and sync_automation_step_edges only rewires
        -- the simple unconditional-in/unconditional-out case, not a
        -- conditional branch or a step with no outgoing edge -- or a branch
        -- the builder never connected to anything) must still be considered
        -- here. The inner join this replaces silently excluded any such
        -- edge from both this loop and the v_has_edges check below,
        -- making a genuinely unwired branch indistinguishable from "this
        -- step has no edges at all" -- i.e. exactly the false-completion
        -- bug this migration fixes, not merely a mislabeled one.
        for v_edge in
          select e.* from public.automation_step_edges e
          left join public.automation_steps ts on ts.id = e.to_step_id
          where e.from_step_id = v_current_step_id
            and (e.to_step_id is null or ts.automation_id = v_run.automation_id)
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
            left join public.automation_steps ts on ts.id = e.to_step_id
            where e.from_step_id = v_current_step_id and (e.to_step_id is null or ts.automation_id = v_run.automation_id)
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

            -- P08-01 shape 2: dead end -- a branch SHOULD have fired
            -- (outgoing edges exist) but none matched and there's no default
            -- edge. This is an abnormal termination, not a success.
            insert into public.automation_execution_logs (workspace_id, automation_id, engagement_id, workflow_run_id, status, execution_data, error_message, executed_at)
            values (v_run.workspace_id, v_run.automation_id, v_run.engagement_id, p_run_id, 'failed',
              jsonb_build_object('run_id', p_run_id, 'step_id', v_current_step_id, 'dead_end', true, 'reason', 'no branch matched and no default edge'),
              'Automation stopped: none of this step''s branches matched the current data, and no default branch is configured.',
              now());
            update public.automation_runs set status = 'failed', completed_at = now() where id = p_run_id;
          else
            -- Genuinely no outgoing edges configured at all -- an
            -- intentional leaf/end of this path. Unchanged: this is a
            -- legitimate completion, not logged as a dead end.
            update public.automation_runs set status = 'completed', completed_at = now() where id = p_run_id;
          end if;
          return;
        end if;

        if v_next_step_id is null then
          -- P08-01 shape 3: unwired branch -- a branch matched, but its
          -- edge points nowhere (deleted destination, or never wired up).
          insert into public.automation_execution_logs (workspace_id, automation_id, engagement_id, workflow_run_id, status, execution_data, error_message, executed_at)
          values (v_run.workspace_id, v_run.automation_id, v_run.engagement_id, p_run_id, 'failed',
            jsonb_build_object('run_id', p_run_id, 'step_id', v_current_step_id, 'unwired_branch', true, 'reason', 'the matching branch has not been connected to a next step yet'),
            'Automation stopped: the matching branch has not been connected to a next step yet.',
            now());
          update public.automation_runs set status = 'failed', completed_at = now() where id = p_run_id;
          return;
        end if;
      end if;

      select * into v_next from public.automation_steps where id = v_next_step_id;
      update public.automation_runs set current_step_id = v_next_step_id where id = p_run_id;

      if v_next.action_type <> 'condition' and v_next.is_enabled = false then
        insert into public.automation_execution_logs (workspace_id, automation_id, engagement_id, workflow_run_id, status, execution_data, executed_at)
        values (v_run.workspace_id, v_run.automation_id, v_run.engagement_id, p_run_id, 'completed',
          jsonb_build_object('run_id', p_run_id, 'step_id', v_next.id, 'action_type', v_next.action_type, 'skipped_disabled', true), now());
        v_current_step_id := v_next_step_id;
        continue;
      end if;

      if v_next.action_type = 'condition' and v_next.delay_minutes = 0 then
        insert into public.automation_execution_logs (workspace_id, automation_id, engagement_id, workflow_run_id, status, execution_data, executed_at)
        values (v_run.workspace_id, v_run.automation_id, v_run.engagement_id, p_run_id, 'completed',
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
  exception when others then
    insert into public.automation_execution_logs (workspace_id, automation_id, engagement_id, workflow_run_id, status, execution_data, error_message, executed_at)
    values (v_run.workspace_id, v_run.automation_id, v_run.engagement_id, p_run_id, 'failed',
      jsonb_build_object('run_id', p_run_id, 'step_id', v_current_step_id, 'unexpected_error', true),
      sqlerrm, now());
    update public.automation_runs set status = 'failed', completed_at = now() where id = p_run_id;
  end;
end;
$function$;

-- Retries a failed automation run. Two distinct failure shapes need two
-- distinct retry actions:
--   - An ordinary action failure (execute_automation_step's own action
--     raised, e.g. a missing template): current_step_id is the step whose
--     action never completed, so re-running execute_automation_step on it
--     is correct, same as before.
--   - A step-resolution failure (P08-01's dead_end/unwired_branch/
--     no_entry_step, or P08-02(b)'s unexpected_error): the CURRENT step's
--     action already completed successfully -- it's resolving what comes
--     NEXT that failed. Re-running execute_automation_step on current_step_id
--     here would silently re-execute that already-completed action a second
--     time. The correct retry is start_next_automation_step(), which
--     re-resolves "what's next" from current_step_id exactly the way every
--     other resume path in this system already does.
-- Distinguished by checking the run's latest failed-status execution log for
-- any of those four markers.
create or replace function public.retry_failed_automation_run(p_run_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_run record;
  v_last_log_data jsonb;
  v_is_resolution_failure boolean;
begin
  if not (public.is_platform_admin() or public.is_platform_it()) then
    raise exception 'insufficient permissions to retry an automation run';
  end if;

  select * into v_run from public.automation_runs where id = p_run_id;
  if v_run.id is null then
    raise exception 'automation run not found';
  end if;
  if v_run.status <> 'failed' then
    raise exception 'this run is not in a failed state';
  end if;

  select execution_data into v_last_log_data
  from public.automation_execution_logs
  where workflow_run_id = p_run_id and status = 'failed'
  order by executed_at desc
  limit 1;

  v_is_resolution_failure := coalesce((v_last_log_data->>'dead_end')::boolean, false)
    or coalesce((v_last_log_data->>'unwired_branch')::boolean, false)
    or coalesce((v_last_log_data->>'no_entry_step')::boolean, false)
    or coalesce((v_last_log_data->>'unexpected_error')::boolean, false);

  update public.automation_runs set status = 'running', completed_at = null where id = p_run_id;

  if v_is_resolution_failure or v_run.current_step_id is null then
    perform public.start_next_automation_step(p_run_id);
  else
    perform public.execute_automation_step(p_run_id, v_run.current_step_id);
  end if;
end;
$$;
