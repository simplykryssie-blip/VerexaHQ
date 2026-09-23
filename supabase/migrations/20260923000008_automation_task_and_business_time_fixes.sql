-- Automation mechanics: reliable task context, business-hour task deadlines,
-- business-hour wait timeouts, and a canonical client_first_name merge field.

DO $migration$
DECLARE
  v_def text;
  v_old text;
  v_new text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'execute_automation_step'
    AND pg_get_function_identity_arguments(p.oid) = 'p_run_id uuid, p_step_id uuid';

  IF v_def IS NULL THEN RAISE EXCEPTION 'execute_automation_step was not found'; END IF;

  IF position('client_first_name' in v_def) = 0 THEN
    v_def := replace(
      v_def,
      $old$'first_name', v_eng.first_name,$old$,
      $new$'first_name', v_eng.first_name,
    'client_first_name', v_eng.first_name,$new$
    );
  END IF;

  IF position($marker$'task_id', v_new_task_id$marker$ in v_def) = 0 THEN
    v_old := $old$      where id = p_run_id;
    elsif v_step.action_type = 'create_appointment' then$old$;
    v_new := $new$      where id = p_run_id;

      update public.automation_runs
      set trigger_snapshot = coalesce(trigger_snapshot, '{}'::jsonb)
        || jsonb_build_object('task_id', v_new_task_id)
      where id = p_run_id;
    elsif v_step.action_type = 'create_appointment' then$new$;
    IF position(v_old in v_def) = 0 THEN
      RAISE EXCEPTION 'create_task continuation anchor not found';
    END IF;
    v_def := replace(v_def, v_old, v_new);
  END IF;

  v_old := $old$case when v_step.action_config ? 'due_in_days' then now() + make_interval(days => (v_step.action_config->>'due_in_days')::int) else null end,$old$;
  v_new := $new$case
        when nullif(v_step.action_config->>'due_in_business_hours', '') is not null
          then public.compute_business_hours_deadline(v_run.workspace_id, now(), (v_step.action_config->>'due_in_business_hours')::numeric)
        when v_step.action_config ? 'due_in_days'
          then now() + make_interval(days => (v_step.action_config->>'due_in_days')::int)
        else null
      end,$new$;

  IF position(v_new in v_def) = 0 THEN
    IF position(v_old in v_def) = 0 THEN
      v_def := replace(v_def, v_old, v_new);
    ELSE
      RAISE EXCEPTION 'task due-date anchor not found';
    END IF;
  END IF;

  EXECUTE v_def;
END
$migration$;

CREATE OR REPLACE FUNCTION public.should_advance_wait_until_step(p_pending_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_pending record;
  v_step record;
  v_run record;
  v_wait_mode text;
  v_timeout_days int;
  v_timeout_hours numeric;
  v_timeout_at timestamptz;
BEGIN
  SELECT * INTO v_pending FROM public.automation_pending_steps WHERE id = p_pending_id;
  IF v_pending.id IS NULL THEN RETURN true; END IF;

  SELECT * INTO v_step FROM public.automation_steps WHERE id = v_pending.automation_step_id;
  SELECT * INTO v_run FROM public.automation_runs WHERE id = v_pending.run_id;

  IF v_step.action_type = 'condition' THEN
    v_timeout_days := coalesce(nullif(v_step.action_config->>'retry_timeout_days', '')::int, 90);
    IF nullif(v_step.action_config->>'retry_timeout_business_hours', '') IS NOT NULL THEN
      v_timeout_hours := (v_step.action_config->>'retry_timeout_business_hours')::numeric;
      v_timeout_at := public.compute_business_hours_deadline(v_run.workspace_id, v_pending.created_at, v_timeout_hours);
      IF now() >= v_timeout_at THEN RETURN true; END IF;
    ELSIF v_pending.created_at < now() - make_interval(days => v_timeout_days) THEN
      RETURN true;
    END IF;

    RETURN EXISTS (
      SELECT 1 FROM public.automation_step_edges e
      WHERE e.from_step_id = v_step.id
        AND (e.branch_conditions IS NULL OR public.evaluate_automation_conditions(
          e.branch_conditions, v_run.trigger_snapshot, v_run.workspace_id, v_run.client_id,
          v_run.engagement_id, v_run.connection_id, v_run.onboarding_id
        ))
    );
  END IF;

  v_wait_mode := coalesce(v_step.action_config->>'wait_mode', 'duration');
  IF v_wait_mode <> 'until_condition' THEN RETURN true; END IF;

  IF nullif(v_step.action_config->>'wait_timeout_business_hours', '') IS NOT NULL THEN
    v_timeout_hours := (v_step.action_config->>'wait_timeout_business_hours')::numeric;
    v_timeout_at := public.compute_business_hours_deadline(v_run.workspace_id, v_pending.created_at, v_timeout_hours);
    IF now() >= v_timeout_at THEN RETURN true; END IF;
  ELSE
    v_timeout_days := coalesce(nullif(v_step.action_config->>'wait_timeout_days', '')::int, 30);
    IF v_pending.created_at < now() - make_interval(days => v_timeout_days) THEN RETURN true; END IF;
  END IF;

  RETURN public.evaluate_automation_conditions(
    v_step.action_config->'wait_conditions',
    v_run.trigger_snapshot,
    v_run.workspace_id,
    v_run.client_id,
    v_run.engagement_id,
    v_run.connection_id,
    v_run.onboarding_id
  );
END;
$function$;