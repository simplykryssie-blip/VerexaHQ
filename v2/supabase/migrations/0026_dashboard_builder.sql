-- Phase 2: Firm Configuration Engine -- Dashboard Builder

create table public.dashboards (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  name text not null,
  slug text not null,
  role_slug text check (role_slug in ('owner', 'admin', 'ero', 'ptin_preparer', 'staff', 'client')),
  is_default boolean not null default false,
  status text not null default 'published' check (status in ('draft', 'published', 'archived')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, slug)
);
comment on table public.dashboards is 'A configurable dashboard layout. role_slug ties it to a system role (owner/admin/ero/ptin_preparer/staff) for role-aware defaults; null means general-purpose.';

create unique index dashboards_system_slug_key on public.dashboards (slug) where workspace_id is null;
create index dashboards_workspace_idx on public.dashboards (workspace_id);

create table public.dashboard_widgets (
  id uuid primary key default gen_random_uuid(),
  dashboard_id uuid not null references public.dashboards(id) on delete cascade,
  widget_type text not null check (widget_type in (
    'todays_work', 'missing_documents', 'review_queue', 'returns_due', 'signatures_pending',
    'messages', 'revenue', 'collections', 'kpis', 'staff_workload', 'client_health', 'compliance'
  )),
  title text,
  display_order integer not null default 0,
  grid_position jsonb not null default '{}'::jsonb,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (dashboard_id, display_order) deferrable initially deferred
);
comment on table public.dashboard_widgets is 'A single widget placed on a dashboard. grid_position holds layout (x/y/w/h); config holds widget-specific options.';

create index dashboard_widgets_dashboard_idx on public.dashboard_widgets (dashboard_id, display_order);

create trigger set_updated_at before update on public.dashboards for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.dashboard_widgets for each row execute function public.set_updated_at();
create trigger audit_dashboards after insert or update or delete on public.dashboards for each row execute function public.audit_trigger_fn();
create trigger audit_dashboard_widgets after insert or update or delete on public.dashboard_widgets for each row execute function public.audit_trigger_fn();

alter table public.dashboards enable row level security;
alter table public.dashboard_widgets enable row level security;

create policy dashboards_select on public.dashboards
  for select using (workspace_id is null or public.is_workspace_member(workspace_id));
create policy dashboards_insert on public.dashboards
  for insert with check (workspace_id is not null and public.is_workspace_admin(workspace_id));
create policy dashboards_update on public.dashboards
  for update using (workspace_id is not null and public.is_workspace_admin(workspace_id));
create policy dashboards_delete on public.dashboards
  for delete using (workspace_id is not null and public.is_workspace_admin(workspace_id));

create policy dashboard_widgets_select on public.dashboard_widgets
  for select using (
    exists (select 1 from public.dashboards d where d.id = dashboard_widgets.dashboard_id
      and (d.workspace_id is null or public.is_workspace_member(d.workspace_id)))
  );
create policy dashboard_widgets_write on public.dashboard_widgets
  for all using (
    exists (select 1 from public.dashboards d where d.id = dashboard_widgets.dashboard_id
      and d.workspace_id is not null and public.is_workspace_admin(d.workspace_id))
  )
  with check (
    exists (select 1 from public.dashboards d where d.id = dashboard_widgets.dashboard_id
      and d.workspace_id is not null and public.is_workspace_admin(d.workspace_id))
  );
