create table public.document_request_templates (
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
comment on table public.document_request_templates is 'A reusable list of documents to request from a Taxpayer for a Case.';

create unique index document_request_templates_system_slug_key on public.document_request_templates (slug) where workspace_id is null;
create index document_request_templates_workspace_idx on public.document_request_templates (workspace_id);

create table public.document_request_items (
  id uuid primary key default gen_random_uuid(),
  document_request_template_id uuid not null references public.document_request_templates(id) on delete cascade,
  category text not null,
  name text not null,
  instructions text,
  is_required boolean not null default true,
  conditional_logic jsonb not null default '{}'::jsonb,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (document_request_template_id, display_order) deferrable initially deferred
);
comment on table public.document_request_items is 'A single requested document within a request template. conditional_logic can make a request appear only when prior answers/documents warrant it.';

create index document_request_items_template_idx on public.document_request_items (document_request_template_id, display_order);

create trigger set_updated_at before update on public.document_request_templates for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.document_request_items for each row execute function public.set_updated_at();
create trigger audit_document_request_templates after insert or update or delete on public.document_request_templates for each row execute function public.audit_trigger_fn();
create trigger audit_document_request_items after insert or update or delete on public.document_request_items for each row execute function public.audit_trigger_fn();

alter table public.document_request_templates enable row level security;
alter table public.document_request_items enable row level security;

create policy document_request_templates_select on public.document_request_templates
  for select using (workspace_id is null or public.is_workspace_member(workspace_id));
create policy document_request_templates_insert on public.document_request_templates
  for insert with check (workspace_id is not null and public.is_workspace_admin(workspace_id));
create policy document_request_templates_update on public.document_request_templates
  for update using (workspace_id is not null and public.is_workspace_admin(workspace_id));
create policy document_request_templates_delete on public.document_request_templates
  for delete using (workspace_id is not null and public.is_workspace_admin(workspace_id));

create policy document_request_items_select on public.document_request_items
  for select using (
    exists (select 1 from public.document_request_templates t where t.id = document_request_items.document_request_template_id
      and (t.workspace_id is null or public.is_workspace_member(t.workspace_id)))
  );
create policy document_request_items_write on public.document_request_items
  for all using (
    exists (select 1 from public.document_request_templates t where t.id = document_request_items.document_request_template_id
      and t.workspace_id is not null and public.is_workspace_admin(t.workspace_id))
  )
  with check (
    exists (select 1 from public.document_request_templates t where t.id = document_request_items.document_request_template_id
      and t.workspace_id is not null and public.is_workspace_admin(t.workspace_id))
  );
