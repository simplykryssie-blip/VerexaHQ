-- Make move_pipeline_stage idempotent for forward-only workflows.
-- If the entity is already beyond the requested target stage, the desired
-- state is already satisfied. Treat the action as a no-op instead of failing
-- the automation. This is required for repeat purchases that reuse an
-- existing Firm Connection whose onboarding pipeline has already advanced.
DO $$
DECLARE
  v_def text;
  v_old text := $old$
        if v_target_order < v_current_order then
          raise exception 'Moving backward through pipeline stages is not supported by this action';
        end if;
$old$;
  v_new text := $new$
        if v_target_order < v_current_order then
          -- The entity is already beyond this requested stage. Treat the
          -- forward-only move as satisfied instead of failing the automation.
          v_skip_note := 'target pipeline stage already passed; no-op';
          v_target_stage_id := v_pipeline_stage_id;
        end if;
$new$;
BEGIN
  SELECT pg_get_functiondef(p.oid)
    INTO v_def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public'
    AND p.proname='execute_automation_step'
    AND pg_get_function_identity_arguments(p.oid)='p_run_id uuid, p_step_id uuid';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'execute_automation_step(uuid, uuid) not found';
  END IF;

  IF position(v_old in v_def)=0 THEN
    RAISE EXCEPTION 'Expected move_pipeline_stage backward-check block not found';
  END IF;

  IF position(v_old in substring(v_def from position(v_old in v_def)+1))>0 THEN
    RAISE EXCEPTION 'Found multiple backward-check blocks';
  END IF;

  EXECUTE replace(v_def,v_old,v_new);
END $$;
