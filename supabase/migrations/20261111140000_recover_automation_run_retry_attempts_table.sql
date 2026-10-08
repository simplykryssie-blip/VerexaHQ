-- Migration-history recovery: automation_run_retry_attempts.
--
-- Tracked separately as DRIFT-001 by main's own
-- fix_retry_failed_automation_run_production_baseline migration: that
-- migration's retry_failed_automation_run body (already the correct,
-- current one -- see recon-347) inserts into this table, but no CREATE
-- TABLE for it exists anywhere in this repository's git history --
-- confirmed it exists only in the live database and in
-- lib/database.types.ts (generated from the live database). This recovers
-- the table (not the function, which recon-347 already carries forward
-- correctly) from PR #337's own original migration, verified column-for-
-- column against production.
create table public.automation_run_retry_attempts (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.automation_runs(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  attempt_number int not null,
  step_id_at_retry uuid references public.automation_steps(id) on delete set null,
  retried_by uuid references auth.users(id) on delete set null,
  retried_at timestamptz not null default now(),
  unique (run_id, attempt_number)
);

create index automation_run_retry_attempts_run_id_idx on public.automation_run_retry_attempts(run_id);
create index automation_run_retry_attempts_workspace_id_idx on public.automation_run_retry_attempts(workspace_id);

alter table public.automation_run_retry_attempts enable row level security;

-- Read access matches who can already see the run itself (automations.manage
-- on the run's workspace, or platform admin/IT) -- no broader than the
-- existing automation_runs select policy's own population.
create policy automation_run_retry_attempts_select on public.automation_run_retry_attempts
  for select using (
    public.has_permission(workspace_id, 'automations.manage')
    or public.is_platform_admin()
    or public.is_platform_it()
  );

-- Writes only ever happen from inside retry_failed_automation_run (SECURITY
-- DEFINER, runs as table owner) -- no direct client insert/update/delete
-- path is needed or granted.
