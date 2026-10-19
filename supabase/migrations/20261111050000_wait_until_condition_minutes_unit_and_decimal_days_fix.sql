-- Isolated fix + feature addition, scoped to the "wait until condition"
-- delay step's own timeout handling in should_advance_wait_until_step().
-- No other branch of this function, no other function, and no grant is
-- touched -- the 'condition' action_type's retry_timeout_days handling
-- (a separate, unrelated feature) is left exactly as it was.
--
-- Part 1 -- root-cause fix: the wait_timeout_days value was cast straight
-- to Postgres `int` (`(...)::int`). Confirmed live that `'0.5'::int` raises
-- a hard "invalid input syntax for type integer" error -- there is no
-- rounding or truncation, it just throws. The calling cron
-- (run-pending-automation-steps) only destructured `data` from that RPC
-- call, never checked `error`, so on this exact crash `shouldAdvance` came
-- back `undefined` -- not `false` -- and the code fell through to advancing
-- the step immediately, without ever having evaluated whether its real
-- wait_conditions were actually met. Switching the cast to `::numeric`
-- (make_interval's `days` parameter already accepts a fractional value)
-- removes the crash at its source, for any current or future non-integer
-- input, not just the specific value this happened with.
--
-- Part 2 -- feature: adds a `wait_timeout_minutes` config key, mirroring
-- the existing `wait_timeout_business_hours` pattern exactly (checked
-- ahead of the calendar-days fallback, mutually exclusive with it). Lets a
-- workflow's timeout be configured in minutes instead of only whole days
-- or business hours -- e.g. to test a "wait until condition" step in
-- minutes rather than waiting out its real multi-day timeout.
CREATE OR REPLACE FUNCTION public.should_advance_wait_until_step(p_pending_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_pending record; v_step record; v_run record; v_wait_mode text;
v_timeout_days int; v_timeout_minutes numeric; v_timeout_hours numeric; v_timeout_at timestamptz;
BEGIN
SELECT * INTO v_pending FROM public.automation_pending_steps WHERE id=p_pending_id;
IF v_pending.id IS NULL THEN RETURN true; END IF;
SELECT * INTO v_step FROM public.automation_steps WHERE id=v_pending.automation_step_id;
SELECT * INTO v_run FROM public.automation_runs WHERE id=v_pending.run_id;
IF v_step.action_type='condition' THEN
 v_timeout_days:=coalesce(nullif(v_step.action_config->>'retry_timeout_days','')::int,90);
 IF nullif(v_step.action_config->>'retry_timeout_business_hours','') IS NOT NULL THEN
  v_timeout_hours:=(v_step.action_config->>'retry_timeout_business_hours')::numeric;
  v_timeout_at:=public.compute_business_hours_deadline(v_run.workspace_id,v_pending.created_at,v_timeout_hours);
  IF now()>=v_timeout_at THEN RETURN true; END IF;
 ELSIF v_pending.created_at<now()-make_interval(days=>v_timeout_days) THEN RETURN true; END IF;
 RETURN EXISTS(SELECT 1 FROM public.automation_step_edges e WHERE e.from_step_id=v_step.id
  AND (e.branch_conditions IS NULL OR public.evaluate_automation_conditions(e.branch_conditions,v_run.trigger_snapshot,v_run.workspace_id,v_run.client_id,v_run.engagement_id,v_run.connection_id,v_run.onboarding_id)));
END IF;
v_wait_mode:=coalesce(v_step.action_config->>'wait_mode','duration');
IF v_wait_mode<>'until_condition' THEN RETURN true; END IF;
IF nullif(v_step.action_config->>'wait_timeout_business_hours','') IS NOT NULL THEN
 v_timeout_hours:=(v_step.action_config->>'wait_timeout_business_hours')::numeric;
 v_timeout_at:=public.compute_business_hours_deadline(v_run.workspace_id,v_pending.created_at,v_timeout_hours);
 IF now()>=v_timeout_at THEN RETURN true; END IF;
ELSIF nullif(v_step.action_config->>'wait_timeout_minutes','') IS NOT NULL THEN
 v_timeout_minutes:=(v_step.action_config->>'wait_timeout_minutes')::numeric;
 IF v_pending.created_at<now()-make_interval(secs=>v_timeout_minutes*60) THEN RETURN true; END IF;
ELSE
 IF v_pending.created_at<now()-make_interval(secs=>coalesce(nullif(v_step.action_config->>'wait_timeout_days','')::numeric,30)*86400) THEN RETURN true; END IF;
END IF;
RETURN public.evaluate_automation_conditions(v_step.action_config->'wait_conditions',v_run.trigger_snapshot,v_run.workspace_id,v_run.client_id,v_run.engagement_id,v_run.connection_id,v_run.onboarding_id);
END;
$function$;
