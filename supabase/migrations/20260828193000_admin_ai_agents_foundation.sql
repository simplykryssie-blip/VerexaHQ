-- Verexa Admin AI: Phase 1 foundation.
--
-- Platform-level (not workspace-level) infrastructure shared by the four
-- Admin AI agents (QA, Security, Workflow, Performance). Access is gated by
-- a new is_platform_ai_operator flag on user_profiles, mirroring the
-- existing is_platform_admin/is_platform_it pattern -- a platform admin can
-- delegate Admin AI access without handing out full platform-admin rights.
--
-- Safety: every agent run is hard-restricted to workspaces flagged
-- is_demo = true (three already exist: Demo - ERO Office, Demo - Service
-- Bureau, Summit Tax & Financial Services). This is enforced inside
-- start_agent_run itself, not just in the UI, so there is no code path for
-- an agent run to ever target a real client workspace.

alter table public.user_profiles add column if not exists is_platform_ai_operator boolean not null default false;

create or replace function public.is_platform_ai_operator()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce((select is_platform_ai_operator or is_platform_admin from public.user_profiles where id = auth.uid()), false);
$function$;

create or replace function public.can_access_admin_ai()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select public.is_platform_admin() or public.is_platform_ai_operator();
$function$;

-- Only an existing platform admin may grant/revoke the narrower AI-operator
-- flag -- this is the one write path for the capability described in the
-- spec's "Admin-only access" section.
create or replace function public.set_platform_ai_operator(p_user_id uuid, p_enabled boolean)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not public.is_platform_admin() then
    raise exception 'insufficient permissions';
  end if;
  update public.user_profiles set is_platform_ai_operator = p_enabled, updated_at = now() where id = p_user_id;
end;
$function$;

-- ---------------------------------------------------------------------
-- Agent registry
-- ---------------------------------------------------------------------

create table public.ai_agents (
  id uuid primary key default gen_random_uuid(),
  agent_key text not null unique check (agent_key in ('qa', 'security', 'workflow', 'performance')),
  name text not null,
  description text not null,
  agent_type text not null default 'system_monitor',
  version text not null default '0.1.0',
  is_enabled boolean not null default false,
  config jsonb not null default '{}'::jsonb,
  last_run_id uuid,
  last_run_at timestamptz,
  last_success_run_at timestamptz,
  last_failure_run_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ai_agents enable row level security;

create policy ai_agents_select on public.ai_agents for select using (public.can_access_admin_ai());

insert into public.ai_agents (agent_key, name, description, is_enabled) values
  ('qa', 'Verexa QA Agent', 'Tests Verexa end-to-end against synthetic data in demo workspaces and identifies functional defects, regressions, and business-logic failures.', false),
  ('security', 'Verexa Security Agent', 'Tests authentication, authorization, tenant isolation, and data-exposure boundaries using controlled test identities.', false),
  ('workflow', 'Verexa Workflow Agent', 'Compares configured automations against their actual execution and reports discrepancies.', false),
  ('performance', 'Verexa Performance Agent', 'Measures page, API, database, and workflow performance and correlates regressions with QA/Workflow findings.', false);

-- ---------------------------------------------------------------------
-- Runs
-- ---------------------------------------------------------------------

create table public.ai_agent_runs (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.ai_agents(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  initiated_by uuid references auth.users(id),
  run_type text not null check (run_type in ('full', 'module', 'regression', 'custom')),
  scope jsonb not null default '{}'::jsonb,
  objective text,
  status text not null default 'running' check (status in ('running', 'completed', 'failed', 'cancelled')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  summary jsonb not null default '{}'::jsonb,
  error_message text,
  ai_analysis jsonb,
  created_at timestamptz not null default now()
);

create index ai_agent_runs_agent_id_idx on public.ai_agent_runs(agent_id, started_at desc);
create index ai_agent_runs_workspace_id_idx on public.ai_agent_runs(workspace_id);

alter table public.ai_agent_runs enable row level security;

create policy ai_agent_runs_select on public.ai_agent_runs for select using (public.can_access_admin_ai());

-- Live progress stream for a run (Part 18 "live run experience").
create table public.ai_agent_run_events (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.ai_agent_runs(id) on delete cascade,
  seq integer not null,
  level text not null default 'info' check (level in ('info', 'success', 'warning', 'error')),
  message text not null,
  meta jsonb,
  created_at timestamptz not null default now(),
  unique (run_id, seq)
);

create index ai_agent_run_events_run_id_idx on public.ai_agent_run_events(run_id, seq);

alter table public.ai_agent_run_events enable row level security;

create policy ai_agent_run_events_select on public.ai_agent_run_events for select using (public.can_access_admin_ai());

-- Cost/resource control (Part 25) -- hard caps enforced by append_agent_run_event.
create table public.ai_agent_run_budgets (
  run_id uuid primary key references public.ai_agent_runs(id) on delete cascade,
  max_duration_seconds integer not null default 600,
  max_steps integer not null default 200,
  max_ai_calls integer not null default 50,
  consumed_steps integer not null default 0,
  consumed_ai_calls integer not null default 0,
  hard_stopped_at timestamptz,
  hard_stop_reason text
);

alter table public.ai_agent_run_budgets enable row level security;

create policy ai_agent_run_budgets_select on public.ai_agent_run_budgets for select using (public.can_access_admin_ai());

-- ---------------------------------------------------------------------
-- Findings (shared shape across all four agents)
-- ---------------------------------------------------------------------

create table public.ai_agent_findings (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.ai_agents(id) on delete cascade,
  run_id uuid not null references public.ai_agent_runs(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  category text not null,
  severity text not null check (severity in ('critical', 'high', 'medium', 'low')),
  title text not null,
  description text not null,
  expected_behavior text,
  actual_behavior text,
  reproduction_steps jsonb,
  affected_module text,
  related_record_type text,
  related_record_id text,
  -- Stable hash of agent+category+affected_module+title used to dedupe
  -- across runs and detect regressions (Part 20) instead of creating
  -- endless duplicate rows for the same underlying defect.
  fingerprint text not null,
  status text not null default 'open' check (status in ('open', 'investigating', 'fixed', 'retest_required', 'resolved', 'reopened')),
  regression_of uuid references public.ai_agent_findings(id),
  ai_analysis jsonb,
  possible_cause text,
  first_detected_at timestamptz not null default now(),
  last_detected_at timestamptz not null default now(),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  decision_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index ai_agent_findings_agent_id_idx on public.ai_agent_findings(agent_id, status);
create index ai_agent_findings_run_id_idx on public.ai_agent_findings(run_id);
create index ai_agent_findings_fingerprint_idx on public.ai_agent_findings(fingerprint);

alter table public.ai_agent_findings enable row level security;

create policy ai_agent_findings_select on public.ai_agent_findings for select using (public.can_access_admin_ai());

-- Evidence attached to a run and/or a specific finding. Payload must be
-- sanitized (no secrets/PII) before insertion -- enforced by the app layer,
-- never by this table.
create table public.ai_agent_evidence (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.ai_agent_runs(id) on delete cascade,
  finding_id uuid references public.ai_agent_findings(id) on delete cascade,
  evidence_type text not null check (evidence_type in ('screenshot', 'browser_console', 'network', 'http_response', 'db_error', 'workflow_execution', 'timing', 'test_step', 'synthetic_record', 'log')),
  payload jsonb not null default '{}'::jsonb,
  storage_path text,
  created_at timestamptz not null default now()
);

create index ai_agent_evidence_run_id_idx on public.ai_agent_evidence(run_id);
create index ai_agent_evidence_finding_id_idx on public.ai_agent_evidence(finding_id);

alter table public.ai_agent_evidence enable row level security;

create policy ai_agent_evidence_select on public.ai_agent_evidence for select using (public.can_access_admin_ai());

-- Cross-agent correlation (Part 15) -- e.g. a QA failure, a Workflow
-- condition defect, and a Performance timeout all pointing at one root cause.
create table public.ai_agent_finding_correlations (
  id uuid primary key default gen_random_uuid(),
  finding_id_a uuid not null references public.ai_agent_findings(id) on delete cascade,
  finding_id_b uuid not null references public.ai_agent_findings(id) on delete cascade,
  relationship text not null default 'related',
  confidence text check (confidence in ('low', 'medium', 'high')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  check (finding_id_a <> finding_id_b),
  unique (finding_id_a, finding_id_b)
);

alter table public.ai_agent_finding_correlations enable row level security;

create policy ai_agent_finding_correlations_select on public.ai_agent_finding_correlations for select using (public.can_access_admin_ai());

-- ---------------------------------------------------------------------
-- Test personas (Part 7) -- controlled identities in demo workspaces only.
-- No credentials are ever stored here; a persona's password is generated
-- on demand via the service-role admin API immediately before use and is
-- never persisted or logged.
-- ---------------------------------------------------------------------

create table public.ai_agent_test_personas (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  persona_role text not null,
  auth_user_id uuid references auth.users(id),
  label text not null,
  is_active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index ai_agent_test_personas_workspace_id_idx on public.ai_agent_test_personas(workspace_id);

alter table public.ai_agent_test_personas enable row level security;

create policy ai_agent_test_personas_select on public.ai_agent_test_personas for select using (public.can_access_admin_ai());

-- ---------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------

create or replace function public.is_ai_sandbox_workspace(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce((select is_demo from public.workspaces where id = p_workspace_id), false);
$function$;

create or replace function public.start_agent_run(
  p_agent_key text,
  p_workspace_id uuid,
  p_run_type text,
  p_scope jsonb default '{}'::jsonb,
  p_objective text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_agent record;
  v_run_id uuid;
begin
  if not public.can_access_admin_ai() then
    raise exception 'insufficient permissions';
  end if;

  if not public.is_ai_sandbox_workspace(p_workspace_id) then
    raise exception 'Admin AI agents may only run against workspaces flagged is_demo -- this is a hard safety boundary, not a preference';
  end if;

  select * into v_agent from public.ai_agents where agent_key = p_agent_key;
  if v_agent.id is null then
    raise exception 'unknown agent: %', p_agent_key;
  end if;
  if not v_agent.is_enabled then
    raise exception '% is not yet enabled', v_agent.name;
  end if;

  insert into public.ai_agent_runs (agent_id, workspace_id, initiated_by, run_type, scope, objective)
  values (v_agent.id, p_workspace_id, auth.uid(), p_run_type, p_scope, p_objective)
  returning id into v_run_id;

  insert into public.ai_agent_run_budgets (run_id) values (v_run_id);

  update public.ai_agents set last_run_id = v_run_id, last_run_at = now(), updated_at = now() where id = v_agent.id;

  return v_run_id;
end;
$function$;

create or replace function public.append_agent_run_event(
  p_run_id uuid,
  p_level text,
  p_message text,
  p_meta jsonb default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_budget record;
  v_next_seq integer;
begin
  if not public.can_access_admin_ai() then
    raise exception 'insufficient permissions';
  end if;

  select * into v_budget from public.ai_agent_run_budgets where run_id = p_run_id;
  if v_budget.run_id is null then
    raise exception 'run not found';
  end if;
  if v_budget.hard_stopped_at is not null then
    raise exception 'this run was hard-stopped (%) and cannot log further events', v_budget.hard_stop_reason;
  end if;

  if v_budget.consumed_steps + 1 > v_budget.max_steps then
    update public.ai_agent_run_budgets set hard_stopped_at = now(), hard_stop_reason = 'max_steps exceeded' where run_id = p_run_id;
    update public.ai_agent_runs set status = 'failed', completed_at = now(), error_message = 'Run exceeded its maximum step budget and was stopped.' where id = p_run_id;
    raise exception 'run exceeded max_steps budget and was stopped';
  end if;

  select coalesce(max(seq), 0) + 1 into v_next_seq from public.ai_agent_run_events where run_id = p_run_id;

  insert into public.ai_agent_run_events (run_id, seq, level, message, meta)
  values (p_run_id, v_next_seq, p_level, p_message, p_meta);

  update public.ai_agent_run_budgets set consumed_steps = consumed_steps + 1 where run_id = p_run_id;
end;
$function$;

create or replace function public.complete_agent_run(
  p_run_id uuid,
  p_status text,
  p_summary jsonb default '{}'::jsonb,
  p_ai_analysis jsonb default null,
  p_error_message text default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_agent_id uuid;
begin
  if not public.can_access_admin_ai() then
    raise exception 'insufficient permissions';
  end if;
  if p_status not in ('completed', 'failed', 'cancelled') then
    raise exception 'invalid terminal status: %', p_status;
  end if;

  update public.ai_agent_runs
  set status = p_status, completed_at = now(), summary = p_summary, ai_analysis = p_ai_analysis, error_message = p_error_message
  where id = p_run_id and status = 'running'
  returning agent_id into v_agent_id;

  if v_agent_id is null then
    raise exception 'run not found or already completed';
  end if;

  if p_status = 'completed' then
    update public.ai_agents set last_success_run_at = now(), updated_at = now() where id = v_agent_id;
  elsif p_status = 'failed' then
    update public.ai_agents set last_failure_run_at = now(), updated_at = now() where id = v_agent_id;
  end if;
end;
$function$;

-- Creates a finding, or -- when a matching open/investigating/retest_required
-- finding with the same fingerprint already exists -- refreshes it instead
-- of creating a duplicate (Part 20). If a previously fixed/resolved finding
-- reappears, it is reopened and flagged as a regression.
create or replace function public.create_agent_finding(
  p_agent_key text,
  p_run_id uuid,
  p_workspace_id uuid,
  p_category text,
  p_severity text,
  p_title text,
  p_description text,
  p_fingerprint text,
  p_expected_behavior text default null,
  p_actual_behavior text default null,
  p_reproduction_steps jsonb default null,
  p_affected_module text default null,
  p_related_record_type text default null,
  p_related_record_id text default null,
  p_ai_analysis jsonb default null,
  p_possible_cause text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_agent_id uuid;
  v_existing record;
  v_finding_id uuid;
begin
  if not public.can_access_admin_ai() then
    raise exception 'insufficient permissions';
  end if;

  select id into v_agent_id from public.ai_agents where agent_key = p_agent_key;
  if v_agent_id is null then
    raise exception 'unknown agent: %', p_agent_key;
  end if;

  select * into v_existing from public.ai_agent_findings
  where agent_id = v_agent_id and workspace_id = p_workspace_id and fingerprint = p_fingerprint
  order by created_at desc
  limit 1;

  if v_existing.id is not null and v_existing.status in ('open', 'investigating', 'retest_required') then
    update public.ai_agent_findings
    set last_detected_at = now(), run_id = p_run_id, actual_behavior = coalesce(p_actual_behavior, actual_behavior),
        ai_analysis = coalesce(p_ai_analysis, ai_analysis), updated_at = now()
    where id = v_existing.id
    returning id into v_finding_id;
    return v_finding_id;
  end if;

  if v_existing.id is not null and v_existing.status in ('fixed', 'resolved') then
    update public.ai_agent_findings
    set status = 'reopened', regression_of = v_existing.id, last_detected_at = now(), run_id = p_run_id,
        actual_behavior = coalesce(p_actual_behavior, actual_behavior), ai_analysis = coalesce(p_ai_analysis, ai_analysis),
        updated_at = now()
    where id = v_existing.id
    returning id into v_finding_id;
    return v_finding_id;
  end if;

  insert into public.ai_agent_findings (
    agent_id, run_id, workspace_id, category, severity, title, description, fingerprint,
    expected_behavior, actual_behavior, reproduction_steps, affected_module,
    related_record_type, related_record_id, ai_analysis, possible_cause
  ) values (
    v_agent_id, p_run_id, p_workspace_id, p_category, p_severity, p_title, p_description, p_fingerprint,
    p_expected_behavior, p_actual_behavior, p_reproduction_steps, p_affected_module,
    p_related_record_type, p_related_record_id, p_ai_analysis, p_possible_cause
  )
  returning id into v_finding_id;

  return v_finding_id;
end;
$function$;

create or replace function public.update_agent_finding_status(
  p_finding_id uuid,
  p_status text,
  p_decision_notes text default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not public.can_access_admin_ai() then
    raise exception 'insufficient permissions';
  end if;
  if p_status not in ('open', 'investigating', 'fixed', 'retest_required', 'resolved', 'reopened') then
    raise exception 'invalid status: %', p_status;
  end if;

  update public.ai_agent_findings
  set status = p_status, decision_notes = coalesce(p_decision_notes, decision_notes),
      reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now()
  where id = p_finding_id;

  if not found then
    raise exception 'finding not found';
  end if;
end;
$function$;

create or replace function public.correlate_agent_findings(
  p_finding_id_a uuid,
  p_finding_id_b uuid,
  p_relationship text default 'related',
  p_confidence text default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_a uuid := least(p_finding_id_a, p_finding_id_b);
  v_b uuid := greatest(p_finding_id_a, p_finding_id_b);
begin
  if not public.can_access_admin_ai() then
    raise exception 'insufficient permissions';
  end if;
  if p_finding_id_a = p_finding_id_b then
    raise exception 'cannot correlate a finding with itself';
  end if;

  insert into public.ai_agent_finding_correlations (finding_id_a, finding_id_b, relationship, confidence, created_by)
  values (v_a, v_b, p_relationship, p_confidence, auth.uid())
  on conflict (finding_id_a, finding_id_b) do update set relationship = excluded.relationship, confidence = excluded.confidence;
end;
$function$;

create or replace function public.record_agent_evidence(
  p_run_id uuid,
  p_evidence_type text,
  p_payload jsonb default '{}'::jsonb,
  p_finding_id uuid default null,
  p_storage_path text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_evidence_id uuid;
begin
  if not public.can_access_admin_ai() then
    raise exception 'insufficient permissions';
  end if;

  insert into public.ai_agent_evidence (run_id, finding_id, evidence_type, payload, storage_path)
  values (p_run_id, p_finding_id, p_evidence_type, p_payload, p_storage_path)
  returning id into v_evidence_id;

  return v_evidence_id;
end;
$function$;
