-- Fixes two false-positive alerts that showed up in the system-failures
-- digest: both cron jobs involved were actually healthy.
--
-- 1. check-stale-cron-jobs pulled the 2000 most recent successful runs
--    *across all jobs combined*, then took the first one seen per job_key.
--    Several jobs run every 1-5 minutes and produce thousands of success
--    rows a day between them, so once-daily jobs (refresh-zoom-tokens,
--    refresh-calendar-tokens, revoke-expired-portal-access,
--    bill-phone-numbers) get pushed out of that global top-2000 window
--    within a few hours even though they succeeded fine -- the check then
--    reads "no success in the window" as "has never logged a successful
--    run" and alerts on a job that isn't actually broken.
create or replace function public.get_cron_job_last_success()
returns table (job_key text, last_success_at timestamptz)
language sql
stable security definer
set search_path = public
as $$
  select job_key, max(completed_at) as last_success_at
  from public.cron_job_runs
  where status = 'success'
  group by job_key;
$$;

revoke all on function public.get_cron_job_last_success() from public, anon, authenticated;
grant execute on function public.get_cron_job_last_success() to service_role;

-- 2. check-stale-automation-queues flags any automation_pending_steps row
--    whose scheduled_for is more than 30 minutes old, which is right for a
--    plain delay step (it should fire within a minute or two of its time)
--    but wrong for a "wait until condition" step: those deliberately sit in
--    pending_delay -- re-checked every tick by
--    should_advance_wait_until_step -- for up to their own
--    wait_timeout_days, only firing early if the condition is met sooner.
--    A client who simply hasn't submitted their organizer yet isn't a
--    stuck queue; the fix below is entirely in the route (it now looks at
--    each row's action_config to use the step's own timeout instead of the
--    flat 30-minute one), no schema change needed for it.
