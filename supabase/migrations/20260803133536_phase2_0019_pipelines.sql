create table public.pipelines (
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
comment on table public.pipelines is 'A kanban board definition Cases move through, e.g. Prospective Taxpayers -> Active -> Waiting For Documents -> Review -> Ready To Release -> Completed.';

create unique index pipelines_system_slug_key on public.pipelines (slug) where workspace_id is null;
create index pipelines_workspace_idx on public.pipelines (workspace_id);

create table public.pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  pipeline_id uuid not null references public.pipelines(id) on delete cascade,
  name text not null,
  display_order integer not null default 0,
  color text,
  is_terminal boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (pipeline_id, display_order) deferrable initially deferred
);
comment on table public.pipeline_stages is 'Drag-and-drop-orderable column in a pipeline board. is_terminal marks a stage such as Completed that ends the Case''s journey through this board.';

create index pipeline_stages_pipeline_idx on public.pipeline_stages (pipeline_id, display_order);

create trigger set_updated_at before update on public.pipelines for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.pipeline_stages for each row execute function public.set_updated_at();
create trigger audit_pipelines after insert or update or delete on public.pipelines for each row execute function public.audit_trigger_fn();
create trigger audit_pipeline_stages after insert or update or delete on public.pipeline_stages for each row execute function public.audit_trigger_fn();

alter table public.pipelines enable row level security;
alter table public.pipeline_stages enable row level security;

create policy pipelines_select on public.pipelines
  for select using (workspace_id is null or public.is_workspace_member(workspace_id));
create policy pipelines_insert on public.pipelines
  for insert with check (workspace_id is not null and public.is_workspace_admin(workspace_id));
create policy pipelines_update on public.pipelines
  for update using (workspace_id is not null and public.is_workspace_admin(workspace_id));
create policy pipelines_delete on public.pipelines
  for delete using (workspace_id is not null and public.is_workspace_admin(workspace_id));

create policy pipeline_stages_select on public.pipeline_stages
  for select using (
    exists (select 1 from public.pipelines p where p.id = pipeline_stages.pipeline_id
      and (p.workspace_id is null or public.is_workspace_member(p.workspace_id)))
  );
create policy pipeline_stages_write on public.pipeline_stages
  for all using (
    exists (select 1 from public.pipelines p where p.id = pipeline_stages.pipeline_id
      and p.workspace_id is not null and public.is_workspace_admin(p.workspace_id))
  )
  with check (
    exists (select 1 from public.pipelines p where p.id = pipeline_stages.pipeline_id
      and p.workspace_id is not null and public.is_workspace_admin(p.workspace_id))
  );
