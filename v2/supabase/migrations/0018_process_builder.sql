-- Phase 2: Firm Configuration Engine -- Process Builder
-- A Process ("Workflow" in system terminology) is a reusable template of
-- ordered Stages, each generating Task Templates. workspace_id NULL = Verexa
-- system template (read-only); NOT NULL = a workspace's own editable copy.

create table public.processes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  name text not null,
  slug text not null,
  description text,
  status text not null default 'published' check (status in ('draft', 'published', 'archived')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, slug)
);
comment on table public.processes is 'A Process ("Workflow") template: an ordered set of stages and tasks used to complete a Case.';

create unique index processes_system_slug_key on public.processes (slug) where workspace_id is null;
create index processes_workspace_idx on public.processes (workspace_id);

create table public.process_stages (
  id uuid primary key default gen_random_uuid(),
  process_id uuid not null references public.processes(id) on delete cascade,
  name text not null,
  display_order integer not null default 0,
  reviewer_role_id uuid references public.roles(id) on delete set null,
  completion_rule text not null default 'all_tasks_complete'
    check (completion_rule in ('all_tasks_complete', 'any_task_complete', 'manual_only')),
  due_date_rule jsonb not null default '{}'::jsonb,
  entry_conditions jsonb not null default '{}'::jsonb,
  notify_on_entry jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (process_id, display_order) deferrable initially deferred
);
comment on table public.process_stages is 'Ordered stage within a Process. due_date_rule/entry_conditions/notify_on_entry are small rule DSLs stored as JSON, not hardcoded.';
comment on column public.process_stages.reviewer_role_id is 'Which system/custom role must sign off before this stage completes, if any.';

create index process_stages_process_idx on public.process_stages (process_id, display_order);

create table public.process_tasks (
  id uuid primary key default gen_random_uuid(),
  process_stage_id uuid not null references public.process_stages(id) on delete cascade,
  name text not null,
  description text,
  display_order integer not null default 0,
  assignee_role_id uuid references public.roles(id) on delete set null,
  is_required boolean not null default true,
  due_date_rule jsonb not null default '{}'::jsonb,
  automation_trigger jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (process_stage_id, display_order) deferrable initially deferred
);
comment on table public.process_tasks is 'A task template generated for every Case that reaches this stage.';

create index process_tasks_stage_idx on public.process_tasks (process_stage_id, display_order);

create trigger set_updated_at before update on public.processes for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.process_stages for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.process_tasks for each row execute function public.set_updated_at();

create trigger audit_processes after insert or update or delete on public.processes for each row execute function public.audit_trigger_fn();
create trigger audit_process_stages after insert or update or delete on public.process_stages for each row execute function public.audit_trigger_fn();
create trigger audit_process_tasks after insert or update or delete on public.process_tasks for each row execute function public.audit_trigger_fn();

alter table public.processes enable row level security;
alter table public.process_stages enable row level security;
alter table public.process_tasks enable row level security;

create policy processes_select on public.processes
  for select using (workspace_id is null or public.is_workspace_member(workspace_id));
create policy processes_insert on public.processes
  for insert with check (workspace_id is not null and public.is_workspace_admin(workspace_id));
create policy processes_update on public.processes
  for update using (workspace_id is not null and public.is_workspace_admin(workspace_id));
create policy processes_delete on public.processes
  for delete using (workspace_id is not null and public.is_workspace_admin(workspace_id));

create policy process_stages_select on public.process_stages
  for select using (
    exists (select 1 from public.processes p where p.id = process_stages.process_id
      and (p.workspace_id is null or public.is_workspace_member(p.workspace_id)))
  );
create policy process_stages_write on public.process_stages
  for all using (
    exists (select 1 from public.processes p where p.id = process_stages.process_id
      and p.workspace_id is not null and public.is_workspace_admin(p.workspace_id))
  )
  with check (
    exists (select 1 from public.processes p where p.id = process_stages.process_id
      and p.workspace_id is not null and public.is_workspace_admin(p.workspace_id))
  );

create policy process_tasks_select on public.process_tasks
  for select using (
    exists (
      select 1 from public.process_stages ps join public.processes p on p.id = ps.process_id
      where ps.id = process_tasks.process_stage_id
        and (p.workspace_id is null or public.is_workspace_member(p.workspace_id))
    )
  );
create policy process_tasks_write on public.process_tasks
  for all using (
    exists (
      select 1 from public.process_stages ps join public.processes p on p.id = ps.process_id
      where ps.id = process_tasks.process_stage_id
        and p.workspace_id is not null and public.is_workspace_admin(p.workspace_id)
    )
  )
  with check (
    exists (
      select 1 from public.process_stages ps join public.processes p on p.id = ps.process_id
      where ps.id = process_tasks.process_stage_id
        and p.workspace_id is not null and public.is_workspace_admin(p.workspace_id)
    )
  );
