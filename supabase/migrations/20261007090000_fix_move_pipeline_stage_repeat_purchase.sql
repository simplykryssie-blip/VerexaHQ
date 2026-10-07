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

      v_loop_guard := 0;
      while v_pipeline_stage_id is distinct from v_target_stage_id and v_loop_guard < 100 loop
        update public.pipeline_stages set status = 'Completed', completed_at = now() where id = v_pipeline_stage_id;
        select current_stage_id into v_pipeline_stage_id from public.pipeline_runs where id = v_pipeline_run_id;
        v_loop_guard := v_loop_guard + 1;
      end loop;
$old$;
  v_new text := $new$
      if v_target_order < v_current_order then
        -- A forward-only "move to stage" action is already satisfied when
        -- the pipeline has advanced beyond its target. This is especially
        -- important for repeat purchases that reuse an existing connection.
        v_skip_note := 'target pipeline stage already passed; no-op';
      else
        v_loop_guard := 0;
        while v_pipeline_stage_id is distinct from v_target_stage_id and v_loop_guard < 100 loop
          update public.pipeline_stages set status = 'Completed', completed_at = now() where id = v_pipeline_stage_id;
          select current_stage_id into v_pipeline_stage_id from public.pipeline_runs where id = v_pipeline_run_id;
          v_loop_guard := v_loop_guard + 1;
        end loop;
      end if;
$new$;
BEGIN
  SELECT pg_get_functiondef(p.oid)
    INTO v_def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'execute_automation_step'
    AND pg_get_function_identity_arguments(p.oid) = 'p_run_id uuid, p_step_id uuid';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'execute_automation_step(uuid, uuid) not found';
  END IF;

  IF length(v_def) - length(replace(v_def, v_old, '')) <> length(v_old) THEN
    RAISE EXCEPTION 'Expected exactly one move_pipeline_stage backward-check block';
  END IF;

  v_def := replace(v_def, v_old, v_new);
  EXECUTE v_def;
END $$;
