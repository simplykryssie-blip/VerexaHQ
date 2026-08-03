-- Epic 3A: Engagement Foundation -- Part 1 (reconcile drift, secure, extend core).
--
-- engagements / engagement_status_history / workflow_runs / workflow_stages /
-- tasks / due_date_rules / automation_execution_logs (+ 4 enum types +
-- generate_engagement_number / start_engagement_workflow / audit_workflow_event /
-- expire_stale_engagement_shares) were already applied directly to this
-- Supabase project by a process outside this git repo -- no migration file
-- existed for any of it. This migration is idempotent throughout (IF NOT
-- EXISTS / CREATE OR REPLACE) so it captures that existing state for git
-- parity without erroring on objects that already exist, then fixes what was
-- actually broken and fills the gaps against the Epic 3A spec:
--
--   - public.tasks had RLS DISABLED entirely -- anon/authenticated could read
--     and write every row via the API. Fixed below.
--   - engagements / workflow_runs / workflow_stages / due_date_rules /
--     automation_execution_logs had RLS *enabled* but zero policies -- safe
--     (fails closed) but completely unusable by the app. Fixed below.
--   - generate_engagement_number() counted engagements across ALL workspaces
--     combined (a cross-tenant numbering bug) with no concurrency guard (a
--     race condition under simultaneous inserts). Rewritten to be
--     per-workspace-per-year and safe under concurrent inserts.
--   - engagements was missing service_id, engagement_type_id (no lookup
--     table existed at all), a top-level lifecycle status (only a
--     review-specific review_status enum existed), and updated_at.
--   - tasks was missing workspace_id, so it could only be workspace-scoped
--     via a join through engagements; added directly for RLS + indexing.
--   - client_id/workspace_id on engagements were nullable, contradicting
--     "every Engagement belongs to exactly one Client" and the
--     workspace-scoped architecture rule. Now NOT NULL.
--
-- Note for whoever reviews this: a "Simulation Workspace"
-- (00000000-0000-0000-0000-000000000001) and one engagement numbered
-- SIM-2026-000001 already exist in this project, inserted directly (not via
-- create_workspace()/create_client()) by whatever produced the drift above.
-- Left in place per "preserve existing data" -- flagged for a human decision
-- on whether to remove it, not deleted here.

-- ============================================================================
-- 1. Enums (idempotent)
-- ============================================================================
do $$ begin
  if not exists (select 1 from pg_type where typname = 'engagement_priority') then
    create type public.engagement_priority as enum ('Low', 'Medium', 'High', 'Urgent');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'review_status') then
    create type public.review_status as enum ('Pending', 'In Review', 'Approved', 'Rejected', 'Corrections Requested');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'workflow_run_status') then
    create type public.workflow_run_status as enum ('Pending', 'Active', 'Paused', 'Cancelled', 'Completed');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'workflow_stage_status') then
    create type public.workflow_stage_status as enum ('Pending', 'In Progress', 'Waiting', 'Completed', 'Skipped');
  end if;
end $$;

-- ============================================================================
-- 2. Tables as they already exist live (IF NOT EXISTS -- no-ops here; gives a
--    fresh environment parity with production).
-- ============================================================================
create table if not exists public.engagements (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  client_id uuid references public.clients(id),
  workspace_id uuid references public.workspaces(id),
  blueprint_id uuid references public.blueprints(id),
  workflow_id uuid references public.processes(id),
  current_stage text,
  priority public.engagement_priority default 'Medium',
  review_status public.review_status default 'Pending',
  assigned_staff_id uuid references public.user_profiles(id),
  reviewer_id uuid references public.user_profiles(id),
  compliance_officer_id uuid references public.user_profiles(id),
  owner_workspace_id uuid references public.workspaces(id),
  shared_status text,
  open_date timestamptz default now(),
  due_date timestamptz,
  completed_date timestamptz,
  archived_date timestamptz,
  internal_reference text,
  engagement_number text
);
create unique index if not exists engagements_engagement_number_key on public.engagements (engagement_number);
create index if not exists idx_engagements_number on public.engagements (engagement_number);
create index if not exists idx_engagements_client on public.engagements (client_id);

create table if not exists public.engagement_status_history (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references public.engagements(id) on delete cascade,
  old_status text,
  new_status text not null,
  changed_by uuid references public.user_profiles(id),
  changed_at timestamptz default now(),
  reason text,
  audit_reference uuid references public.audit_log(id)
);
create index if not exists idx_engagement_status_history_engagement on public.engagement_status_history (engagement_id, changed_at desc);

create table if not exists public.workflow_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  engagement_id uuid not null references public.engagements(id) on delete cascade,
  process_id uuid not null references public.processes(id),
  status public.workflow_run_status default 'Pending',
  current_stage_id uuid,
  started_at timestamptz,
  completed_at timestamptz,
  paused_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_workflow_runs_engagement on public.workflow_runs (engagement_id);
create index if not exists idx_workflow_runs_workspace on public.workflow_runs (workspace_id);

create table if not exists public.workflow_stages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  workflow_run_id uuid not null references public.workflow_runs(id) on delete cascade,
  process_stage_id uuid not null references public.process_stages(id),
  stage_name text not null,
  display_order integer not null,
  status public.workflow_stage_status default 'Pending',
  assigned_staff_id uuid references public.user_profiles(id),
  reviewer_id uuid references public.user_profiles(id),
  started_at timestamptz,
  completed_at timestamptz,
  due_date timestamptz,
  estimated_duration interval,
  actual_duration interval,
  sla_status text,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_workflow_stages_run on public.workflow_stages (workflow_run_id);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'fk_current_stage') then
    alter table public.workflow_runs add constraint fk_current_stage foreign key (current_stage_id) references public.workflow_stages(id);
  end if;
end $$;

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  workflow_stage_id uuid not null references public.workflow_stages(id) on delete cascade,
  engagement_id uuid not null references public.engagements(id) on delete cascade,
  title text not null,
  description text,
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'completed', 'blocked')),
  assigned_staff_id uuid references public.user_profiles(id),
  due_date timestamptz,
  completed_at timestamptz,
  priority text default 'medium' check (priority in ('low', 'medium', 'high', 'critical')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_tasks_workflow_stage on public.tasks (workflow_stage_id);
create index if not exists idx_tasks_engagement on public.tasks (engagement_id);
create index if not exists idx_tasks_assigned_staff on public.tasks (assigned_staff_id);
create index if not exists idx_tasks_status on public.tasks (status);

create table if not exists public.due_date_rules (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  name text not null,
  rule_type text not null,
  base_date_type text,
  offset_days integer default 0,
  is_active boolean default true,
  metadata jsonb,
  created_at timestamptz default now()
);
create index if not exists idx_due_date_rules_workspace on public.due_date_rules (workspace_id);

create table if not exists public.automation_execution_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  automation_id uuid not null references public.automations(id),
  engagement_id uuid references public.engagements(id),
  workflow_run_id uuid references public.workflow_runs(id),
  status text not null,
  executed_at timestamptz default now(),
  execution_data jsonb,
  error_message text
);
create index if not exists idx_automation_logs_run on public.automation_execution_logs (workflow_run_id);

-- ============================================================================
-- 3. Engagement Types lookup (workspace_id NULL = Verexa system type, same
--    pattern as roles/services/etc.). "module" lets future non-tax modules
--    (Bookkeeping, Payroll, Business Formation, Advisory) register their own
--    types without ever touching this table's shape or any tax-specific logic.
-- ============================================================================
create table public.engagement_types (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  slug text not null,
  name text not null,
  description text,
  module text not null default 'tax',
  status text not null default 'published' check (status in ('draft', 'published', 'archived')),
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, slug)
);
comment on table public.engagement_types is 'Lookup for what kind of Engagement this is. workspace_id NULL = Verexa system type (read-only). module lets future non-tax modules register their own types without redesigning this table or hardcoding tax-only logic anywhere that reads it.';

create trigger set_updated_at before update on public.engagement_types for each row execute function public.set_updated_at();

alter table public.engagement_types enable row level security;
create policy engagement_types_select on public.engagement_types for select using (workspace_id is null or public.is_workspace_member(workspace_id));
create policy engagement_types_insert on public.engagement_types for insert with check (workspace_id is not null and public.is_workspace_admin(workspace_id));
create policy engagement_types_update on public.engagement_types for update using (workspace_id is not null and public.is_workspace_admin(workspace_id)) with check (workspace_id is not null and public.is_workspace_admin(workspace_id));
create policy engagement_types_delete on public.engagement_types for delete using (workspace_id is not null and public.is_workspace_admin(workspace_id));

insert into public.engagement_types (workspace_id, slug, name, module, display_order) values
  (null, 'individual-return', 'Individual Return', 'tax', 1),
  (null, 'business-return', 'Business Return', 'tax', 2),
  (null, 'extension', 'Extension', 'tax', 3),
  (null, 'amended-return', 'Amended Return', 'tax', 4),
  (null, 'irs-notice', 'IRS Notice', 'tax', 5),
  (null, 'tax-planning', 'Tax Planning', 'tax', 6);

-- ============================================================================
-- 4. Structural fixes + new engagements columns
-- ============================================================================
alter table public.tasks add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;
update public.tasks t set workspace_id = e.workspace_id from public.engagements e where t.engagement_id = e.id and t.workspace_id is null;
alter table public.tasks alter column workspace_id set not null;
create index if not exists idx_tasks_workspace on public.tasks (workspace_id);

alter table public.engagements alter column client_id set not null;
alter table public.engagements alter column workspace_id set not null;

alter table public.engagements add column if not exists service_id uuid references public.services(id);
alter table public.engagements add column if not exists engagement_type_id uuid references public.engagement_types(id);
alter table public.engagements add column if not exists updated_at timestamptz not null default now();
alter table public.engagements add column if not exists status text not null default 'New' check (status in (
  'New', 'Waiting On Client', 'Waiting On Staff', 'In Progress', 'Waiting On Review',
  'Corrections Requested', 'Approved', 'Waiting On Signature', 'Waiting On Payment',
  'Ready To Release', 'Completed', 'Archived'
));
create index if not exists idx_engagements_workspace on public.engagements (workspace_id);
create index if not exists idx_engagements_status on public.engagements (workspace_id, status);
create index if not exists idx_engagements_engagement_type on public.engagements (engagement_type_id);
create index if not exists idx_engagements_service on public.engagements (service_id);

create trigger set_updated_at before update on public.engagements for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.workflow_runs for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.workflow_stages for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.tasks for each row execute function public.set_updated_at();

-- ============================================================================
-- 5. Fix generate_engagement_number(): per-workspace-per-year, concurrency-safe
--    (was: count(*) across ALL workspaces combined, no locking).
-- ============================================================================
create or replace function public.generate_engagement_number()
returns trigger
language plpgsql
as $$
declare
  v_year text := to_char(now(), 'YYYY');
  v_next bigint;
begin
  if new.engagement_number is not null then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(new.workspace_id::text || v_year, 0));

  select count(*) + 1 into v_next
  from public.engagements
  where workspace_id = new.workspace_id and to_char(open_date, 'YYYY') = v_year;

  new.engagement_number := 'ENG-' || v_year || '-' || lpad(v_next::text, 6, '0');
  return new;
end;
$$;

-- ============================================================================
-- 6. RLS: fix the critical hole (tasks) and the fails-closed-but-unusable
--    tables (engagements/workflow_runs/workflow_stages/due_date_rules/
--    automation_execution_logs/engagement_status_history). Split
--    select/insert/update/delete throughout (no FOR ALL) to avoid the
--    multiple-permissive-policies advisor warning established as a rule
--    earlier in this project.
-- ============================================================================
alter table public.engagements enable row level security;
alter table public.engagement_status_history enable row level security;
alter table public.workflow_runs enable row level security;
alter table public.workflow_stages enable row level security;
alter table public.tasks enable row level security;
alter table public.due_date_rules enable row level security;
alter table public.automation_execution_logs enable row level security;

create policy engagements_select on public.engagements for select using (public.has_permission(workspace_id, 'engagements.view'));
create policy engagements_insert on public.engagements for insert with check (public.has_permission(workspace_id, 'engagements.manage'));
create policy engagements_update on public.engagements for update using (public.has_permission(workspace_id, 'engagements.manage') or public.has_permission(workspace_id, 'engagements.assign')) with check (public.has_permission(workspace_id, 'engagements.manage') or public.has_permission(workspace_id, 'engagements.assign'));
create policy engagements_delete on public.engagements for delete using (public.is_workspace_admin(workspace_id));

create policy engagement_status_history_select on public.engagement_status_history for select using (
  exists (select 1 from public.engagements e where e.id = engagement_status_history.engagement_id and public.has_permission(e.workspace_id, 'engagements.view'))
);
-- No insert/update/delete policy for authenticated: written only by the
-- auto-history trigger added in the next migration (SECURITY DEFINER),
-- same insert-only pattern as audit_log/login_history.

create policy workflow_runs_select on public.workflow_runs for select using (public.has_permission(workspace_id, 'engagements.view'));
create policy workflow_runs_insert on public.workflow_runs for insert with check (public.has_permission(workspace_id, 'engagements.manage'));
create policy workflow_runs_update on public.workflow_runs for update using (public.has_permission(workspace_id, 'engagements.manage')) with check (public.has_permission(workspace_id, 'engagements.manage'));
create policy workflow_runs_delete on public.workflow_runs for delete using (public.is_workspace_admin(workspace_id));

create policy workflow_stages_select on public.workflow_stages for select using (public.has_permission(workspace_id, 'engagements.view'));
create policy workflow_stages_insert on public.workflow_stages for insert with check (public.has_permission(workspace_id, 'engagements.manage'));
create policy workflow_stages_update on public.workflow_stages for update using (public.has_permission(workspace_id, 'engagements.manage') or (select auth.uid()) = assigned_staff_id) with check (public.has_permission(workspace_id, 'engagements.manage') or (select auth.uid()) = assigned_staff_id);
create policy workflow_stages_delete on public.workflow_stages for delete using (public.is_workspace_admin(workspace_id));

create policy tasks_select on public.tasks for select using (public.has_permission(workspace_id, 'engagements.view'));
create policy tasks_insert on public.tasks for insert with check (public.has_permission(workspace_id, 'engagements.manage'));
create policy tasks_update on public.tasks for update using (public.has_permission(workspace_id, 'engagements.manage') or (select auth.uid()) = assigned_staff_id) with check (public.has_permission(workspace_id, 'engagements.manage') or (select auth.uid()) = assigned_staff_id);
create policy tasks_delete on public.tasks for delete using (public.has_permission(workspace_id, 'engagements.manage'));

create policy due_date_rules_select on public.due_date_rules for select using (public.is_workspace_member(workspace_id));
create policy due_date_rules_insert on public.due_date_rules for insert with check (public.has_permission(workspace_id, 'engagements.manage'));
create policy due_date_rules_update on public.due_date_rules for update using (public.has_permission(workspace_id, 'engagements.manage')) with check (public.has_permission(workspace_id, 'engagements.manage'));
create policy due_date_rules_delete on public.due_date_rules for delete using (public.has_permission(workspace_id, 'engagements.manage'));

create policy automation_execution_logs_select on public.automation_execution_logs for select using (public.is_workspace_member(workspace_id));
-- No insert/update/delete policy for authenticated: written only by
-- automation execution logic (SECURITY DEFINER), same as audit_log.
