-- Allow create-task steps to use firm business hours for their due date.
-- This is additive: existing due_in_days behavior is unchanged.
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
  IF position('due_in_business_hours' in v_def) > 0 THEN
    RETURN;
  END IF;

  v_old := $anchor$returning id into v_new_task_id;

      update public.automation_runs$anchor$;
  v_new := $replacement$returning id into v_new_task_id;

      if nullif(v_step.action_config->>'due_in_business_hours', '') is not null then
        update public.tasks
        set due_date = public.compute_business_hours_deadline(
          v_run.workspace_id,
          now(),
          (v_step.action_config->>'due_in_business_hours')::numeric
        )
        where id = v_new_task_id;
      end if;

      update public.automation_runs$replacement$;

  IF position(v_old in v_def) = 0 THEN
    RAISE EXCEPTION 'create_task due-date insertion anchor not found';
  END IF;

  v_def := replace(v_def, v_old, v_new);
  EXECUTE v_def;
END
$migration$;