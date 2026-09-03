create table public.organizer_templates (
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
comment on table public.organizer_templates is 'A client intake organizer form template.';

create unique index organizer_templates_system_slug_key on public.organizer_templates (slug) where workspace_id is null;
create index organizer_templates_workspace_idx on public.organizer_templates (workspace_id);

create table public.organizer_fields (
  id uuid primary key default gen_random_uuid(),
  organizer_template_id uuid not null references public.organizer_templates(id) on delete cascade,
  parent_field_id uuid references public.organizer_fields(id) on delete cascade,
  field_type text not null check (field_type in (
    'short_text', 'paragraph', 'number', 'currency', 'date', 'dropdown', 'checkbox',
    'radio_button', 'multiple_choice', 'address', 'ssn', 'ein', 'file_upload',
    'signature', 'repeating_section'
  )),
  label text not null,
  help_text text,
  display_order integer not null default 0,
  is_required boolean not null default false,
  options jsonb not null default '[]'::jsonb,
  conditional_logic jsonb not null default '{}'::jsonb,
  validation jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organizer_template_id, display_order) deferrable initially deferred
);
comment on table public.organizer_fields is 'A single field on an organizer. parent_field_id nests a field inside a repeating_section field. conditional_logic drives show/hide rules.';
comment on column public.organizer_fields.field_type is 'ssn/ein field types render through the same masked-input + reveal pattern as the Phase 1 identity vault, never plaintext in the client.';

create index organizer_fields_template_idx on public.organizer_fields (organizer_template_id, display_order);
create index organizer_fields_parent_idx on public.organizer_fields (parent_field_id);

create trigger set_updated_at before update on public.organizer_templates for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.organizer_fields for each row execute function public.set_updated_at();
create trigger audit_organizer_templates after insert or update or delete on public.organizer_templates for each row execute function public.audit_trigger_fn();
create trigger audit_organizer_fields after insert or update or delete on public.organizer_fields for each row execute function public.audit_trigger_fn();

alter table public.organizer_templates enable row level security;
alter table public.organizer_fields enable row level security;

create policy organizer_templates_select on public.organizer_templates
  for select using (workspace_id is null or public.is_workspace_member(workspace_id));
create policy organizer_templates_insert on public.organizer_templates
  for insert with check (workspace_id is not null and public.is_workspace_admin(workspace_id));
create policy organizer_templates_update on public.organizer_templates
  for update using (workspace_id is not null and public.is_workspace_admin(workspace_id));
create policy organizer_templates_delete on public.organizer_templates
  for delete using (workspace_id is not null and public.is_workspace_admin(workspace_id));

create policy organizer_fields_select on public.organizer_fields
  for select using (
    exists (select 1 from public.organizer_templates t where t.id = organizer_fields.organizer_template_id
      and (t.workspace_id is null or public.is_workspace_member(t.workspace_id)))
  );
create policy organizer_fields_write on public.organizer_fields
  for all using (
    exists (select 1 from public.organizer_templates t where t.id = organizer_fields.organizer_template_id
      and t.workspace_id is not null and public.is_workspace_admin(t.workspace_id))
  )
  with check (
    exists (select 1 from public.organizer_templates t where t.id = organizer_fields.organizer_template_id
      and t.workspace_id is not null and public.is_workspace_admin(t.workspace_id))
  );
