-- Migration Reconciliation Phase 1.10A -- recovered from production.
--
-- Extends should_advance_wait_until_step's condition evaluation to pass
-- connection_id/onboarding_id through to evaluate_automation_conditions,
-- so a Wait/Delay "until condition" or condition-step retry check can see
-- partner-connection- and partner-onboarding-scoped fields, matching what
-- the rest of the automation engine (execute_automation_step and friends)
-- already resolves. Main's current definition (main's latest is
-- 20260904060000_condition_step_retry_until_matched.sql, real production
-- version 20260912215745) only ever passed 5 args
-- (branch_conditions/trigger_snapshot/workspace_id/client_id/engagement_id)
-- -- confirmed via git grep across all of origin/main's history.
--
-- Confidence: A -- exact original recovered from
-- supabase_migrations.schema_migrations.statements (byte-for-byte).
create or replace function public.should_advance_wait_until_step(p_pending_id uuid)
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
begin
  select * into v_pending from public.automation_pending_steps where id = p_pending_id;
  if v_pending.id is null then
    return true;
  end if;

  select * into v_step from public.automation_steps where id = v_pending.automation_step_id;

  if v_step.action_type = 'condition' then
    v_timeout_days := coalesce(nullif(v_step.action_config->>'retry_timeout_days', '')::int, 90);
    if v_pending.created_at < now() - make_interval(days => v_timeout_days) then
      return true;
    end if;

    select * into v_run from public.automation_runs where id = v_pending.run_id;

    return exists (
      select 1 from public.automation_step_edges e
      where e.from_step_id = v_step.id
        and (e.branch_conditions is null or public.evaluate_automation_conditions(e.branch_conditions, v_run.trigger_snapshot, v_run.workspace_id, v_run.client_id, v_run.engagement_id, v_run.connection_id, v_run.onboarding_id))
    );
  end if;

  v_wait_mode := coalesce(v_step.action_config->>'wait_mode', 'duration');

  if v_wait_mode <> 'until_condition' then
    return true;
  end if;

  v_timeout_days := coalesce(nullif(v_step.action_config->>'wait_timeout_days', '')::int, 30);
  if v_pending.created_at < now() - make_interval(days => v_timeout_days) then
    return true;
  end if;

  select * into v_run from public.automation_runs where id = v_pending.run_id;

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
