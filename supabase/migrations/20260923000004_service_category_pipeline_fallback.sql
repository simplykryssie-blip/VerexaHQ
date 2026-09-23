-- Preserve the existing automation executor and only extend the
-- service-pipeline resolution rule:
--   1. service.process_id (specific override)
--   2. service category.process_id (category default)
--   3. fail clearly if neither is configured
--
-- The replacement is guarded so a future executor rewrite does not silently
-- apply this migration against an unexpected function body.

DO $migration$
DECLARE
  v_sql text;
  v_old text := $old$
      select process_id into v_target_process_id from public.services where id = v_resolved_service_id;
      if v_target_process_id is null then
        raise exception 'The client''s selected service has no pipeline configured';
      end if;
$old$;
  v_new text := $new$
      select process_id into v_target_process_id
      from public.services
      where id = v_resolved_service_id;

      if v_target_process_id is null then
        select sc.process_id
        into v_target_process_id
        from public.client_service_interests csi
        join public.service_categories sc on sc.id = csi.service_category_id
        where csi.client_id = v_run.client_id
          and csi.service_id = v_resolved_service_id
        order by csi.created_at desc
        limit 1;
      end if;

      if v_target_process_id is null then
        raise exception 'The selected service and its category have no pipeline configured';
      end if;
$new$;
  v_fn oid;
BEGIN
  SELECT p.oid
  INTO v_fn
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'execute_automation_step'
    AND pg_get_function_identity_arguments(p.oid) = 'p_run_id uuid, p_step_id uuid';

  IF v_fn IS NULL THEN
    RAISE EXCEPTION 'execute_automation_step(uuid, uuid) was not found';
  END IF;

  SELECT pg_get_functiondef(v_fn) INTO v_sql;

  IF position(v_old in v_sql) = 0 THEN
    RAISE EXCEPTION 'Expected service pipeline resolution block was not found; executor was not modified';
  END IF;

  EXECUTE replace(v_sql, v_old, v_new);
END
$migration$;
