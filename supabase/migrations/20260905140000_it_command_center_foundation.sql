-- IT Command Center foundation: gives Nicholas (full platform admin +
-- platform IT) real, actionable visibility into automation failures and
-- background-job health on top of the existing Systems dashboard
-- (system_failure_log + job-queue counts + credentials), which already
-- covers most of "IT team" needs -- this only fills the two real gaps:
-- automation step failures never reached system_failure_log at all, and
-- there was no record of whether a given cron job actually ran on
-- schedule vs. silently stopped.

-- Per-run log of every cron job execution -- lets the Systems page show
-- "last run / status / duration" per job and lets a new staleness check
-- detect a cron that's stopped firing entirely (distinct from the existing
-- stale-queue checks, which only catch a cron that's running but not
-- draining its queue).
create table if not exists public.cron_job_runs (
  id uuid primary key default gen_random_uuid(),
  job_key text not null,
  status text not null check (status in ('success', 'failure')),
  started_at timestamptz not null,
  completed_at timestamptz not null default now(),
  duration_ms int,
  error_message text
);

create index if not exists cron_job_runs_job_key_completed_at_idx on public.cron_job_runs (job_key, completed_at desc);

alter table public.cron_job_runs enable row level security;

create policy cron_job_runs_select on public.cron_job_runs
  for select
  using (public.is_platform_admin() or public.is_platform_it());

-- Cross-workspace read of failed automation runs for the IT dashboard.
-- automation_runs/automation_execution_logs are workspace-scoped by RLS
-- (is_workspace_member), which a platform admin/IT user isn't necessarily
-- a member of -- same reason get_platform_staff_directory exists for the
-- staff roster.
create or replace function public.get_platform_failed_automation_runs(p_limit int default 100)
returns table (
  run_id uuid,
  workspace_id uuid,
  workspace_name text,
  automation_id uuid,
  automation_name text,
  failed_step_id uuid,
  action_type text,
  error_message text,
  failed_at timestamptz
)
language sql
stable security definer
set search_path = public
as $$
  select
    ar.id,
    ar.workspace_id,
    w.name,
    ar.automation_id,
    a.name,
    ar.current_step_id,
    s.action_type,
    lastlog.error_message,
    ar.completed_at
  from public.automation_runs ar
  join public.workspaces w on w.id = ar.workspace_id
  join public.automations a on a.id = ar.automation_id
  left join public.automation_steps s on s.id = ar.current_step_id
  left join lateral (
    select error_message
    from public.automation_execution_logs l
    where l.workflow_run_id = ar.id and l.status = 'failed'
    order by l.executed_at desc
    limit 1
  ) lastlog on true
  where ar.status = 'failed'
    and (public.is_platform_admin() or public.is_platform_it())
  order by ar.completed_at desc nulls last
  limit p_limit;
$$;

revoke all on function public.get_platform_failed_automation_runs(int) from public, anon;
grant execute on function public.get_platform_failed_automation_runs(int) to authenticated;

-- Retries a failed automation run from wherever it stalled -- resets the
-- run to 'running' and re-invokes execute_automation_step on its current
-- (failed) step, exactly what would happen if that step's underlying
-- problem (e.g. a missing template, a transient send failure) is now
-- fixed. Platform-level (any workspace) since this is for IT, not a
-- per-workspace staff action.
create or replace function public.retry_failed_automation_run(p_run_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_run record;
begin
  if not (public.is_platform_admin() or public.is_platform_it()) then
    raise exception 'insufficient permissions to retry an automation run';
  end if;

  select * into v_run from public.automation_runs where id = p_run_id;
  if v_run.id is null then
    raise exception 'automation run not found';
  end if;
  if v_run.status <> 'failed' then
    raise exception 'this run is not in a failed state';
  end if;
  if v_run.current_step_id is null then
    raise exception 'this run has no step to retry';
  end if;

  update public.automation_runs set status = 'running', completed_at = null where id = p_run_id;
  perform public.execute_automation_step(p_run_id, v_run.current_step_id);
end;
$$;

revoke all on function public.retry_failed_automation_run(uuid) from public, anon;
grant execute on function public.retry_failed_automation_run(uuid) to authenticated;

-- Lets the digest-system-failures cron (service-role, no user session) look
-- up real staff email addresses without going through Supabase's paginated
-- admin.listUsers API -- same cross-schema pattern as
-- get_platform_staff_directory.
create or replace function public.get_platform_it_staff_emails()
returns setof text
language sql
stable security definer
set search_path = public
as $$
  select au.email
  from public.user_profiles up
  join auth.users au on au.id = up.id
  where up.is_platform_admin = true or up.is_platform_it = true;
$$;

revoke all on function public.get_platform_it_staff_emails() from public, anon, authenticated;
grant execute on function public.get_platform_it_staff_emails() to service_role;
