-- P09-03/P09-04: notification_queue had no atomic claim step at all -- the
-- dispatch-notifications cron did a plain SELECT ... WHERE status='pending',
-- so two overlapping invocations (a slow run overlapping the next scheduled
-- tick, or a manual re-trigger) could both select and send the same job.
-- Separately, the actual provider send happened before notification_queue's
-- status was durably updated, so a crash/timeout between a successful send
-- and that update left the job 'pending' for the next tick to resend.
--
-- This adds a claimed_at timestamp and a 'processing' status (additive to
-- the existing pending/sent/failed/cancelled set), and a single atomic
-- claim RPC modeled on the existing claim_blocked_automation_runs()
-- function in this codebase: FOR UPDATE SKIP LOCKED so no two callers can
-- claim the same row, plus a staleness window so a job stuck in
-- 'processing' from a crashed/timed-out run is still reclaimable rather
-- than stuck forever.

alter table public.notification_queue add column if not exists claimed_at timestamptz;

alter table public.notification_queue drop constraint if exists notification_queue_status_check;
alter table public.notification_queue add constraint notification_queue_status_check
  check (status = any (array['pending'::text, 'processing'::text, 'sent'::text, 'failed'::text, 'cancelled'::text]));

create or replace function public.claim_notification_queue_jobs(p_limit int default 50, p_stale_after_seconds int default 120)
returns setof public.notification_queue
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  return query
  with claimable as (
    select nq.id
    from public.notification_queue nq
    where nq.scheduled_at <= now()
      and (
        nq.status = 'pending'
        or (nq.status = 'processing' and nq.claimed_at < now() - make_interval(secs => p_stale_after_seconds))
      )
    order by nq.scheduled_at asc
    limit p_limit
    for update skip locked
  )
  update public.notification_queue nq
  set status = 'processing', claimed_at = now()
  from claimable
  where nq.id = claimable.id
  returning nq.*;
end;
$function$;

revoke all on function public.claim_notification_queue_jobs(int, int) from public;
grant execute on function public.claim_notification_queue_jobs(int, int) to service_role;
