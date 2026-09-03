create table public.engagement_letter_templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  name text not null,
  slug text not null,
  body_html text not null default '',
  merge_fields jsonb not null default '[]'::jsonb,
  requires_signature boolean not null default true,
  status text not null default 'published' check (status in ('draft', 'published', 'archived')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, slug)
);
comment on table public.engagement_letter_templates is 'Rich-text engagement letter template with merge fields and e-signature requirement. PDF export and preview are client-side rendering concerns.';

create unique index engagement_letter_templates_system_slug_key on public.engagement_letter_templates (slug) where workspace_id is null;
create index engagement_letter_templates_workspace_idx on public.engagement_letter_templates (workspace_id);

create trigger set_updated_at before update on public.engagement_letter_templates for each row execute function public.set_updated_at();
create trigger audit_engagement_letter_templates after insert or update or delete on public.engagement_letter_templates for each row execute function public.audit_trigger_fn();

alter table public.engagement_letter_templates enable row level security;

create policy engagement_letter_templates_select on public.engagement_letter_templates
  for select using (workspace_id is null or public.is_workspace_member(workspace_id));
create policy engagement_letter_templates_insert on public.engagement_letter_templates
  for insert with check (workspace_id is not null and public.is_workspace_admin(workspace_id));
create policy engagement_letter_templates_update on public.engagement_letter_templates
  for update using (workspace_id is not null and public.is_workspace_admin(workspace_id));
create policy engagement_letter_templates_delete on public.engagement_letter_templates
  for delete using (workspace_id is not null and public.is_workspace_admin(workspace_id));
