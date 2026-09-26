-- Automations reconciliation, Phase 15/17: workspace-authorized workflow
-- retry.
--
-- retry_failed_automation_run already exists (20260905140000) and is
-- already correctly idempotent in the way that matters most: it reuses the
-- SAME automation_runs row and re-invokes execute_automation_step on the
-- exact step that failed, rather than starting a fresh run from the
-- trigger. Because it's the same run_id, this branch's own
-- automation_dedupe_key columns (20261101050000, keyed on
-- 'automation_step:'||step_id||':'||run_id) already protect every side
-- effect (task/appointment/quote/note/message/signature-request) from being
-- duplicated if the failed step had partially succeeded before crashing --
-- no second idempotency system needed, this retry sits directly on top of
-- the one already shipped in this branch.
--
-- What's actually missing is authorization and an audit trail:
--   * gated to is_platform_admin()/is_platform_it() only -- no workspace
--     user, however senior, can retry their own failed workflow run today.
--   * reuses the run row in place with no record of "this is attempt 2",
--     no who/when, and no way to tell from the run itself that it was ever
--     retried.
--
-- Fix: widen the authorization check to also accept a workspace member with
-- automations.manage on the run's own (server-resident, never
-- client-supplied) workspace_id -- platform admin/IT access is preserved
-- unchanged, so the existing platform-admin UI (AutomationFailuresManager)
-- keeps working exactly as before. A new append-only
-- automation_run_retry_attempts table records who retried which run, which
-- step was being retried, and its attempt number -- giving "preserve
-- original failed run" (nothing about the run's own history is destroyed;
-- this is a separate table), "maintain retry relationship" and "maintain
-- attempt number" without duplicating the run or its execution.

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

-- Return type changes from void to jsonb (so the caller can see the new
-- attempt_number) -- CREATE OR REPLACE cannot change a function's return
-- type, so the old signature must be dropped first.
drop function if exists public.retry_failed_automation_run(uuid);

create function public.retry_failed_automation_run(p_run_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_run record;
  v_attempt_number int;
begin
  select * into v_run from public.automation_runs where id = p_run_id;
  if v_run.id is null then
    raise exception 'automation run not found';
  end if;

  -- Workspace identity comes from the run row itself, never from anything
  -- the caller supplies -- has_permission checks auth.uid()'s own
  -- membership in v_run.workspace_id, so a workspace-B user calling this
  -- with workspace-A's run_id simply fails the permission check (no
  -- workspace_users row for them in workspace A). Platform admin/IT access
  -- is unchanged from before this migration.
  if not (
    public.has_permission(v_run.workspace_id, 'automations.manage')
    or public.is_platform_admin()
    or public.is_platform_it()
  ) then
    raise exception 'insufficient permissions to retry this automation run';
  end if;

  if v_run.status <> 'failed' then
    raise exception 'this run is not in a failed state';
  end if;
  if v_run.current_step_id is null then
    raise exception 'this run has no step to retry';
  end if;

  select coalesce(max(attempt_number), 0) + 1 into v_attempt_number
  from public.automation_run_retry_attempts where run_id = p_run_id;

  insert into public.automation_run_retry_attempts (run_id, workspace_id, attempt_number, step_id_at_retry, retried_by)
  values (p_run_id, v_run.workspace_id, v_attempt_number, v_run.current_step_id, auth.uid());

  update public.automation_runs set status = 'running', completed_at = null where id = p_run_id;
  perform public.execute_automation_step(p_run_id, v_run.current_step_id);

  return jsonb_build_object('ok', true, 'attempt_number', v_attempt_number);
end;
$$;

revoke all on function public.retry_failed_automation_run(uuid) from public, anon;
grant execute on function public.retry_failed_automation_run(uuid) to authenticated;
