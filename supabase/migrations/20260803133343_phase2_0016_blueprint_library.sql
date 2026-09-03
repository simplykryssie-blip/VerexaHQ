create table public.blueprints (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  name text not null,
  slug text not null,
  description text,
  category text,
  source_blueprint_id uuid references public.blueprints(id) on delete set null,
  status text not null default 'published' check (status in ('draft', 'published', 'archived')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, slug)
);
comment on table public.blueprints is 'A named bundle of configuration objects. workspace_id NULL = Verexa system blueprint (read-only); NOT NULL = a workspace''s own copy or custom bundle.';
comment on column public.blueprints.source_blueprint_id is 'The system blueprint this workspace copy was created from, if any.';

create unique index blueprints_system_slug_key on public.blueprints (slug) where workspace_id is null;
create index blueprints_workspace_idx on public.blueprints (workspace_id);

create trigger set_updated_at before update on public.blueprints
  for each row execute function public.set_updated_at();
create trigger audit_blueprints after insert or update or delete on public.blueprints
  for each row execute function public.audit_trigger_fn();

alter table public.blueprints enable row level security;

create policy blueprints_select on public.blueprints
  for select using (workspace_id is null or public.is_workspace_member(workspace_id));

create policy blueprints_insert on public.blueprints
  for insert with check (workspace_id is not null and public.is_workspace_admin(workspace_id));

create policy blueprints_update on public.blueprints
  for update using (workspace_id is not null and public.is_workspace_admin(workspace_id));

create policy blueprints_delete on public.blueprints
  for delete using (workspace_id is not null and public.is_workspace_admin(workspace_id));

create table public.blueprint_components (
  id uuid primary key default gen_random_uuid(),
  blueprint_id uuid not null references public.blueprints(id) on delete cascade,
  component_type text not null check (component_type in (
    'service', 'service_category', 'process', 'pipeline', 'organizer_template',
    'document_request_template', 'engagement_letter_template', 'email_template',
    'sms_template', 'pricing_rule', 'billing_rule', 'automation', 'dashboard'
  )),
  component_id uuid not null,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  unique (blueprint_id, component_type, component_id)
);
comment on table public.blueprint_components is 'Polymorphic membership: which configuration objects (by type + id) belong to a blueprint.';

create index blueprint_components_blueprint_idx on public.blueprint_components (blueprint_id);
create index blueprint_components_lookup_idx on public.blueprint_components (component_type, component_id);

alter table public.blueprint_components enable row level security;

create policy blueprint_components_select on public.blueprint_components
  for select using (
    exists (
      select 1 from public.blueprints b
      where b.id = blueprint_components.blueprint_id
        and (b.workspace_id is null or public.is_workspace_member(b.workspace_id))
    )
  );

create policy blueprint_components_write on public.blueprint_components
  for all using (
    exists (
      select 1 from public.blueprints b
      where b.id = blueprint_components.blueprint_id
        and b.workspace_id is not null and public.is_workspace_admin(b.workspace_id)
    )
  )
  with check (
    exists (
      select 1 from public.blueprints b
      where b.id = blueprint_components.blueprint_id
        and b.workspace_id is not null and public.is_workspace_admin(b.workspace_id)
    )
  );
