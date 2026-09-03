-- Epic 5: task dependency tracking. No prior table anywhere in the schema
-- tracked this (tasks/process_tasks have no dependency column), so this is
-- new, not a duplicate. Reuses engagements.view/engagements.manage
-- permissions rather than inventing a tasks.* permission set, and the
-- existing set_updated_at/audit_trigger_fn conventions.

create table public.task_dependencies (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  task_id uuid not null references public.tasks(id) on delete cascade,
  depends_on_task_id uuid not null references public.tasks(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint task_dependencies_not_self check (task_id <> depends_on_task_id),
  unique (task_id, depends_on_task_id)
);

create index idx_task_dependencies_workspace on public.task_dependencies(workspace_id);
create index idx_task_dependencies_task on public.task_dependencies(task_id);
create index idx_task_dependencies_depends_on on public.task_dependencies(depends_on_task_id);

create trigger trg_audit after insert or update or delete on public.task_dependencies for each row execute function public.audit_trigger_fn();

alter table public.task_dependencies enable row level security;

create policy task_dependencies_select on public.task_dependencies for select using (has_permission(workspace_id, 'engagements.view'));
create policy task_dependencies_write on public.task_dependencies for insert with check (has_permission(workspace_id, 'engagements.manage'));
create policy task_dependencies_delete on public.task_dependencies for delete using (has_permission(workspace_id, 'engagements.manage'));
