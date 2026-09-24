-- Automations reconciliation, Phase 10/17: wait/resume concurrency.
--
-- app/api/cron/run-pending-automation-steps/route.ts selects due
-- automation_pending_steps rows with a plain (unlocked) SELECT, calls
-- execute_automation_step/start_next_automation_step on each, then deletes
-- the row -- three separate round trips with no row lock between them. Two
-- overlapping invocations of this cron (a slow run still finishing when the
-- next scheduled tick fires, or a manual trigger during a scheduled one)
-- can both select the same due row before either deletes it, and both call
-- execute_automation_step for it -- duplicating whatever side effect that
-- step has (a second email, a second task, a second appointment...). The
-- same gap exists in the second half of the same route, which resumes
-- blocked_at runs the same unlocked-select-then-RPC way.
--
-- Fix: two new SECURITY DEFINER claim RPCs, each a single atomic statement
-- (`for update skip locked` inside a CTE, then UPDATE...RETURNING from it) --
-- the standard Postgres job-queue-claim idiom. A row/run is claimed by
-- exactly one concurrent caller; a second caller's claim attempt on the same
-- row is skipped, not blocked, so neither cron invocation waits on the
-- other. A claim goes stale after 2 minutes (comfortably longer than any
-- single execute_automation_step call should take) so a row is never
-- permanently stuck if the claiming request crashed or hit the route's own
-- deadline before finishing it.

alter table public.automation_pending_steps add column if not exists claimed_at timestamptz;
alter table public.automation_runs add column if not exists resume_claimed_at timestamptz;

create or replace function public.claim_due_pending_automation_steps(p_limit int default 50, p_stale_after_seconds int default 120)
returns table (id uuid, run_id uuid, workspace_id uuid, automation_step_id uuid)
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  return query
  with claimable as (
    select aps.id
    from public.automation_pending_steps aps
    where aps.status = 'pending_delay'
      and aps.scheduled_for <= now()
      and (aps.claimed_at is null or aps.claimed_at < now() - make_interval(secs => p_stale_after_seconds))
    order by aps.scheduled_for asc
    limit p_limit
    for update skip locked
  )
  update public.automation_pending_steps aps
  set claimed_at = now()
  from claimable
  where aps.id = claimable.id
  returning aps.id, aps.run_id, aps.workspace_id, aps.automation_step_id;
end;
$$;

revoke all on function public.claim_due_pending_automation_steps(int, int) from public, anon, authenticated;
grant execute on function public.claim_due_pending_automation_steps(int, int) to service_role;

create or replace function public.claim_blocked_automation_runs(p_limit int default 50, p_stale_after_seconds int default 120)
returns table (id uuid, blocked_step_id uuid)
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  return query
  with claimable as (
    select r.id
    from public.automation_runs r
    where r.status = 'running'
      and r.blocked_at is not null
      and (r.resume_claimed_at is null or r.resume_claimed_at < now() - make_interval(secs => p_stale_after_seconds))
    order by r.blocked_at asc
    limit p_limit
    for update skip locked
  )
  update public.automation_runs r
  set resume_claimed_at = now()
  from claimable
  where r.id = claimable.id
  returning r.id, r.blocked_step_id;
end;
$$;

revoke all on function public.claim_blocked_automation_runs(int, int) from public, anon, authenticated;
grant execute on function public.claim_blocked_automation_runs(int, int) to service_role;
