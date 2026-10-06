-- P08-01/P08-02 corrective migration -- production-baseline reconciliation
-- for retry_failed_automation_run().
--
-- PR #362 (migration 20261104020000_fix_automation_completion_state_and_
-- pending_step_loss.sql, merged to main, NEVER applied to production)
-- rewrote retry_failed_automation_run() against the repository's only
-- tracked definition (20260905140000_it_command_center_foundation.sql):
-- `returns void`, platform-admin/IT-only authorization, no operational
-- gate, no audit trail.
--
-- Attempting to apply that migration to production failed:
--   ERROR: 42P13: cannot change return type of existing function
--   HINT: Use DROP FUNCTION retry_failed_automation_run(uuid) first.
--
-- Investigation (read-only, no production changes) found that the LIVE
-- production retry_failed_automation_run(uuid) has materially diverged from
-- every migration file in this repository's git history:
--   - returns jsonb (`{ok, attempt_number}`), not void.
--   - authorization is workspace-scoped: has_permission(workspace_id,
--     'automations.manage') OR is_platform_admin() OR is_platform_it() --
--     not platform-only.
--   - has an is_workspace_operational(workspace_id) gate the git version
--     never had.
--   - writes an audit row to automation_run_retry_attempts (run_id,
--     workspace_id, attempt_number, step_id_at_retry, retried_by) with a
--     per-run auto-incrementing attempt_number and a UNIQUE(run_id,
--     attempt_number) constraint -- a table that has NO corresponding
--     CREATE TABLE anywhere in this repository's migration history.
-- grep across every *.sql file in supabase/migrations confirms this:
-- automation_run_retry_attempts and this shape of retry_failed_
-- automation_run() exist ONLY in the live database and in the generated
-- lib/database.types.ts (which is generated FROM the live database), never
-- in a tracked migration. This is pre-existing, unexplained production/
-- repository drift that predates and is unrelated to the P08 remediation --
-- tracked separately as DRIFT-001 and deliberately NOT addressed here (no
-- CREATE TABLE for automation_run_retry_attempts is added by this
-- migration; it assumes, correctly for the actual production database,
-- that the table already exists).
--
-- This migration does NOT touch the historical, already-merged
-- 20261104020000 migration file at all -- it is left exactly as merged,
-- as the historical record of what PR #362 contained. This migration
-- supersedes it at apply time by redefining the same two functions again,
-- this time correctly: start_next_automation_step() is carried forward
-- byte-for-byte unchanged from 20261104020000 (no live drift was found for
-- that function -- its signature and the fact that its own CREATE OR
-- REPLACE in the failed attempt raised no error confirms it matches
-- production exactly). retry_failed_automation_run() is rewritten from the
-- ACTUAL verified live definition (captured via pg_get_functiondef against
-- production during the drift investigation), preserving every
-- production-specific behavior listed above unchanged, with only the P08-01
-- retry-dispatch correction added: the unconditional rejection of a null
-- current_step_id is removed, and the run's latest failed execution log is
-- inspected for dead_end/unwired_branch/no_entry_step/unexpected_error to
-- decide whether to resume via start_next_automation_step() (a step-
-- resolution failure, or no entry step at all) or via
-- execute_automation_step() on the current step (an ordinary action
-- failure, exactly as before).
--
-- Out of scope, same as 20261104020000: the synchronous organizer-
-- submission -> automation-resolution transaction coupling, the
-- pending-step concurrent-processing/duplicate-execution risk, and
-- DRIFT-001 (automation_run_retry_attempts has no migration of its own --
-- not created here).

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

-- Rewritten from the ACTUAL verified live definition (captured via
-- pg_get_functiondef during the drift investigation), not from the stale
-- 20260905140000 definition. Preserves, unchanged: the jsonb return
-- contract, workspace-scoped + platform authorization, the operational
-- gate, the automation_run_retry_attempts audit insert (same columns,
-- same attempt_number sequencing, inserted before dispatch), and the exact
-- wording of every pre-existing error message. The ONLY behavior change is
-- the retry-dispatch correction described in the migration header: the
-- unconditional current_step_id IS NULL rejection is removed, and a
-- step-resolution failure (dead_end/unwired_branch/no_entry_step/
-- unexpected_error) is now retried via start_next_automation_step() instead
-- of silently re-running the already-completed current step's action a
-- second time via execute_automation_step().
create or replace function public.retry_failed_automation_run(p_run_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_run record;
  v_attempt_number int;
  v_last_log_data jsonb;
  v_is_resolution_failure boolean;
begin
  select * into v_run from public.automation_runs where id = p_run_id;
  if v_run.id is null then
    raise exception 'automation run not found';
  end if;

  if not (
    public.has_permission(v_run.workspace_id, 'automations.manage')
    or public.is_platform_admin()
    or public.is_platform_it()
  ) then
    raise exception 'insufficient permissions to retry this automation run';
  end if;

  if not public.is_workspace_operational(v_run.workspace_id) then
    raise exception 'this workspace is not currently operational';
  end if;

  if v_run.status <> 'failed' then
    raise exception 'this run is not in a failed state';
  end if;

  -- P08-01: current_step_id IS NULL (no_entry_step) is now a legitimate
  -- retry target. The pre-P08 guard that unconditionally rejected it here
  -- is removed -- dispatch below decides the correct resume path instead
  -- of assuming "retry the current step's action" is always correct.

  select execution_data into v_last_log_data
  from public.automation_execution_logs
  where workflow_run_id = p_run_id and status = 'failed'
  order by executed_at desc
  limit 1;

  v_is_resolution_failure := coalesce((v_last_log_data->>'dead_end')::boolean, false)
    or coalesce((v_last_log_data->>'unwired_branch')::boolean, false)
    or coalesce((v_last_log_data->>'no_entry_step')::boolean, false)
    or coalesce((v_last_log_data->>'unexpected_error')::boolean, false);

  select coalesce(max(attempt_number), 0) + 1 into v_attempt_number
  from public.automation_run_retry_attempts where run_id = p_run_id;

  insert into public.automation_run_retry_attempts (run_id, workspace_id, attempt_number, step_id_at_retry, retried_by)
  values (p_run_id, v_run.workspace_id, v_attempt_number, v_run.current_step_id, auth.uid());

  update public.automation_runs set status = 'running', completed_at = null where id = p_run_id;

  if v_is_resolution_failure or v_run.current_step_id is null then
    perform public.start_next_automation_step(p_run_id);
  else
    perform public.execute_automation_step(p_run_id, v_run.current_step_id);
  end if;

  return jsonb_build_object('ok', true, 'attempt_number', v_attempt_number);
end;
$function$;
