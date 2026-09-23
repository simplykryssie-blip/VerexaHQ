-- Automation mechanics: make task references, business-hour deadlines, and
-- client-name merge fields reliable for workflow configuration.
--
-- This is intentionally implemented as a compatibility migration against the
-- existing automation engine rather than changing any workflow rows.

DO $migration$
DECLARE
  v_def text;
  v_old text;
  v_new text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'execute_automation_step'
    AND pg_get_function_identity_arguments(p.oid) = 'p_run_id uuid, p_step_id uuid';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'execute_automation_step was not found';
  END IF;

  v_old := $$    'first_name', v_eng.first_name,
    'firm_name', v_workspace.name,$$;
  v_new := $$    'first_name', v_eng.first_name,
    'client_first_name', v_eng.first_name,
    'firm_name', v_workspace.name,$$;

  IF position(v_new in v_def) = 0 THEN
    IF position(v_old in v_def) = 0 THEN
      v_def := replace(v_def, v_old, v_new);
    ELSE
      RAISE EXCEPTION 'execute_automation_step client-name context anchor was not found';
    END IF;
  END IF;

  v_old := $$        || jsonb_build_object(
             'created_tasks', 
             coalesce(trigger_snapshot->'created_tasks', '{}'::jsonb) || jsonb_build_object(p_step_id::text, v_new_task_id)
           )$$;
  v_new := $$        || jsonb_build_object(
             'created_tasks',
             coalesce(trigger_snapshot->'created_tasks', '{}'::jsonb) || jsonb_build_object(p_step_id::text, v_new_task_id),
             'task_id', v_new_task_id
           )$$;

  IF position(v_new in v_def) = 0 THEN
    IF position(v_old in v_def) = 0 THEN
      v_def := replace(v_def, v_old, v_new);
    ELSE
      RAISE EXCEPTION 'execute_automation_step created-task snapshot anchor was not found';
    END IF;
  END IF;

  v_old := $$        case when v_step.action_config ? 'due_in_days' then now() + make_interval(days => (v_step.action_config->>'due_in_days')::int) else null end,$$;
  v_new := $$        case
          when nullif(v_step.action_config->>'due_in_business_hours', '') is not null
            then public.compute_business_hours_deadline(v_run.workspace_id, now(), (v_step.action_config->>'due_in_business_hours')::numeric)
          when v_step.action_config ? 'due_in_days'
            then now() + make_interval(days => (v_step.action_config->>'due_in_days')::int)
          else null
        end,$$;

  IF position(v_new in v_def) = 0 THEN
    IF position(v_old in v_def) = 0 THEN
      v_def := replace(v_def, v_old, v_new);
    ELSE
      RAISE EXCEPTION 'execute_automation_step task due-date anchor was not found';
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
declare
  v_pending record;
  v_step record;
  v_run record;
  v_wait_mode text;
  v_timeout_days int;
  v_timeout_hours numeric;
  v_timeout_at timestamptz;
begin
  select * into v_pending
  from public.automation_pending_steps
  where id = p_pending_id;

  if v_pending.id is null then
    return true;
  end if;

  select * into v_step
  from public.automation_steps
  where id = v_pending.automation_step_id;

  select * into v_run
  from public.automation_runs
  where id = v_pending.run_id;

  if v_step.action_type = 'condition' then
    v_timeout_days := coalesce(nullif(v_step.action_config->>'retry_timeout_days', '')::int, 90);

    if nullif(v_step.action_config->>'retry_timeout_business_hours', '') is not null then
      v_timeout_hours := (v_step.action_config->>'retry_timeout_business_hours')::numeric;
      v_timeout_at := public.compute_business_hours_deadline(v_run.workspace_id, v_pending.created_at, v_timeout_hours);
      if now() >= v_timeout_at then
        return true;
      end if;
    elsif v_pending.created_at < now() - make_interval(days => v_timeout_days) then
      return true;
    end if;

    return exists (
      select 1
      from public.automation_step_edges e
      where e.from_step_id = v_step.id
        and (
          e.branch_conditions is null
          or public.evaluate_automation_conditions(
            e.branch_conditions,
            v_run.trigger_snapshot,
            v_run.workspace_id,
            v_run.client_id,
            v_run.engagement_id,
            v_run.connection_id,
            v_run.onboarding_id
          )
        )
    );
  end if;

  v_wait_mode := coalesce(v_step.action_config->>'wait_mode', 'duration');

  if v_wait_mode <> 'until_condition' then
    return true;
  end if;

  if nullif(v_step.action_config->>'wait_timeout_business_hours', '') is not null then
    v_timeout_hours := (v_step.action_config->>'wait_timeout_business_hours')::numeric;
    v_timeout_at := public.compute_business_hours_deadline(v_run.workspace_id, v_pending.created_at, v_timeout_hours);
    if now() >= v_timeout_at then
      return true;
    end if;
  else
    v_timeout_days := coalesce(nullif(v_step.action_config->>'wait_timeout_days', '')::int, 30);
    if v_pending.created_at < now() - make_interval(days => v_timeout_days) then
      return true;
    end if;
  end if;

  return public.evaluate_automation_conditions(
    v_step.action_config->'wait_conditions',
    v_run.trigger_snapshot,
    v_run.workspace_id,
    v_run.client_id,
    v_run.engagement_id,
    v_run.connection_id,
    v_run.onboarding_id
  );
end;
$function$;
