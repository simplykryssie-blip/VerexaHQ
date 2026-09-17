-- P1: should_advance_wait_until_step() re-checks a parked Wait/Delay step's
-- condition(s) without passing connection_id/onboarding_id into the shared
-- evaluator, even though it already recovers the full automation_runs row
-- (which carries both) via v_pending.run_id. This is the one place in the
-- engine that omits them -- start_next_automation_step() (the initial,
-- non-parked path) already passes v_run.connection_id/v_run.onboarding_id
-- correctly; this migration just makes the cron re-check path match it.
--
-- Impact: any Wait ("wait until condition") or condition-step
-- ("retry_until_matched") step whose condition field belongs to
-- firm_connection.* or partner_onboarding.* silently evaluated against an
-- all-null connection/onboarding record on every cron re-check (never the
-- real one), so it could never actually detect the real state and only
-- ever released via its own timeout. Conditions on client/engagement/lead/
-- task/etc. fields were never affected -- those don't depend on
-- p_connection_id/p_onboarding_id.
--
-- No schema change: automation_runs already stores connection_id and
-- onboarding_id (and they're already correctly scoped to that run's own
-- workspace_id by construction, so forwarding them introduces no
-- cross-workspace exposure); automation_pending_steps only needs its
-- existing run_id to recover them. This is a two-line change confined to
-- the two evaluate_automation_conditions() call sites already in this
-- function -- nothing else about condition evaluation, timeout handling,
-- delay/business-hours/until-date modes, or retry semantics changes.

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
