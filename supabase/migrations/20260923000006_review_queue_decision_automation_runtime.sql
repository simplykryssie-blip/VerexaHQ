-- Review Queue Decision runtime support.
-- Keeps condition steps with action_config.decision_mode = 'review_queue'
-- paused in automation_pending_steps until decide_automation_step records
-- an outcome. This migration is already applied to staging and production.

ALTER TABLE public.automation_pending_steps
  DROP CONSTRAINT IF EXISTS automation_pending_steps_status_check;

ALTER TABLE public.automation_pending_steps
  ADD CONSTRAINT automation_pending_steps_status_check
  CHECK (status = ANY (ARRAY[
    'pending_delay'::text,
    'pending_approval'::text,
    'pending_decision'::text,
    'completed'::text,
    'failed'::text,
    'rejected'::text
  ]));

DO $migration$
DECLARE
  v_def text;
  v_anchor text := $anchor$if v_next.action_type = 'condition' and v_next.delay_minutes = 0 then
      insert into public.automation_execution_logs (workspace_id, automation_id, engagement_id, status, execution_data, executed_at)
      values (v_run.workspace_id, v_run.automation_id, v_run.engagement_id, 'completed',
        jsonb_build_object('run_id', p_run_id, 'step_id', v_next.id, 'action_type', 'condition'), now());
      v_current_step_id := v_next_step_id;
      continue;
    end if;

    v_wait_mode := case when v_next.action_type = 'delay' then coalesce(v_next.action_config->>'wait_mode', 'duration') else 'duration' end;

    if v_next.requires_approval then$anchor$;
  v_replacement text := $replacement$if v_next.action_type = 'condition'
       and v_next.action_config->>'decision_mode' = 'review_queue' then
      insert into public.automation_pending_steps (workspace_id, run_id, automation_step_id, status)
      values (v_run.workspace_id, p_run_id, v_next.id, 'pending_decision');

      for v_approver in
        select wu.user_id
        from public.workspace_users wu
        left join public.roles r on r.id = wu.role_id
        where wu.workspace_id = v_run.workspace_id
          and wu.status = 'active'
          and (
            (v_next.approver_role_id is not null and wu.role_id = v_next.approver_role_id)
            or (v_next.approver_role_id is null and (wu.is_owner or r.slug in ('owner', 'admin')))
          )
      loop
        perform public.create_notification(
          v_run.workspace_id,
          v_approver.user_id,
          'automation',
          'automation-review-decision-needed',
          jsonb_build_object(
            'message', coalesce(nullif(v_next.display_name, ''), 'Review Queue Decision') || ' is waiting for a decision',
            'run_id', p_run_id,
            'automation_step_id', v_next.id,
            'engagement_id', v_run.engagement_id,
            'client_id', v_run.client_id
          ),
          array['In-App'],
          'High',
          'automation',
          v_run.automation_id
        );
      end loop;
      return;
    end if;

    if v_next.action_type = 'condition' and v_next.delay_minutes = 0 then
      insert into public.automation_execution_logs (workspace_id, automation_id, engagement_id, status, execution_data, executed_at)
      values (v_run.workspace_id, v_run.automation_id, v_run.engagement_id, 'completed',
        jsonb_build_object('run_id', p_run_id, 'step_id', v_next.id, 'action_type', 'condition'), now());
      v_current_step_id := v_next_step_id;
      continue;
    end if;

    v_wait_mode := case when v_next.action_type = 'delay' then coalesce(v_next.action_config->>'wait_mode', 'duration') else 'duration' end;

    if v_next.requires_approval then$replacement$;
BEGIN
  SELECT pg_get_functiondef(p.oid)
  INTO v_def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'start_next_automation_step'
    AND pg_get_function_identity_arguments(p.oid) = 'p_run_id uuid';

  IF v_def IS NULL OR position(v_anchor in v_def) = 0 THEN
    RAISE EXCEPTION 'Expected start_next_automation_step decision insertion point was not found';
  END IF;

  EXECUTE replace(v_def, v_anchor, v_replacement);
END
$migration$;