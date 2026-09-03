
create table public.document_folders (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  parent_folder_id uuid references public.document_folders(id) on delete cascade,
  name text not null,
  display_order integer not null default 0,
  created_by uuid references public.user_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_document_folders_entity on public.document_folders (entity_type, entity_id);
create index idx_document_folders_parent on public.document_folders (parent_folder_id);
create index idx_document_folders_workspace on public.document_folders (workspace_id);

alter table public.attachments
  add constraint attachments_folder_id_fkey foreign key (folder_id) references public.document_folders(id) on delete set null;

alter table public.document_folders enable row level security;

create policy document_folders_select on public.document_folders
  for select using (has_permission(workspace_id, 'documents.view'));
create policy document_folders_insert on public.document_folders
  for insert with check (has_permission(workspace_id, 'documents.upload'));
create policy document_folders_update on public.document_folders
  for update using (has_permission(workspace_id, 'documents.upload'));
create policy document_folders_delete on public.document_folders
  for delete using (has_permission(workspace_id, 'documents.delete'));

create trigger set_updated_at before update on public.document_folders
  for each row execute function public.set_updated_at();
create trigger audit_trigger after insert or update or delete on public.document_folders
  for each row execute function public.audit_trigger_fn();

-- Reusable per-service folder trees (1040, Bookkeeping, Payroll, etc.),
-- workspace_id null = system template available to every workspace,
-- matching the existing services/engagement_types/document_request_templates
-- global-template convention.
create table public.document_folder_templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  name text not null,
  module text not null,
  status text not null default 'published' check (status in ('draft', 'published', 'archived')),
  created_by uuid references public.user_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.document_folder_template_items (
  id uuid primary key default gen_random_uuid(),
  document_folder_template_id uuid not null references public.document_folder_templates(id) on delete cascade,
  parent_item_id uuid references public.document_folder_template_items(id) on delete cascade,
  name text not null,
  display_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index idx_document_folder_template_items_template on public.document_folder_template_items (document_folder_template_id);
create index idx_document_folder_template_items_parent on public.document_folder_template_items (parent_item_id);
create index idx_document_folder_templates_workspace on public.document_folder_templates (workspace_id);

alter table public.document_folder_templates enable row level security;
alter table public.document_folder_template_items enable row level security;

create policy document_folder_templates_select on public.document_folder_templates
  for select using (workspace_id is null or has_permission(workspace_id, 'documents.view'));
create policy document_folder_templates_insert on public.document_folder_templates
  for insert with check (workspace_id is not null and is_workspace_admin(workspace_id));
create policy document_folder_templates_update on public.document_folder_templates
  for update using (workspace_id is not null and is_workspace_admin(workspace_id));
create policy document_folder_templates_delete on public.document_folder_templates
  for delete using (workspace_id is not null and is_workspace_admin(workspace_id));

create policy document_folder_template_items_select on public.document_folder_template_items
  for select using (exists (
    select 1 from public.document_folder_templates t
    where t.id = document_folder_template_items.document_folder_template_id
      and (t.workspace_id is null or has_permission(t.workspace_id, 'documents.view'))
  ));
create policy document_folder_template_items_insert on public.document_folder_template_items
  for insert with check (exists (
    select 1 from public.document_folder_templates t
    where t.id = document_folder_template_items.document_folder_template_id
      and t.workspace_id is not null and is_workspace_admin(t.workspace_id)
  ));
create policy document_folder_template_items_update on public.document_folder_template_items
  for update using (exists (
    select 1 from public.document_folder_templates t
    where t.id = document_folder_template_items.document_folder_template_id
      and t.workspace_id is not null and is_workspace_admin(t.workspace_id)
  ));
create policy document_folder_template_items_delete on public.document_folder_template_items
  for delete using (exists (
    select 1 from public.document_folder_templates t
    where t.id = document_folder_template_items.document_folder_template_id
      and t.workspace_id is not null and is_workspace_admin(t.workspace_id)
  ));

create trigger set_updated_at before update on public.document_folder_templates
  for each row execute function public.set_updated_at();
create trigger audit_trigger after insert or update or delete on public.document_folder_templates
  for each row execute function public.audit_trigger_fn();

alter table public.services add column if not exists document_folder_template_id uuid references public.document_folder_templates(id);
