-- Phase 2: Firm Configuration Engine -- Email + SMS Template Builders

create table public.email_templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  name text not null,
  slug text not null,
  category text,
  subject text not null,
  body_html text not null default '',
  merge_fields jsonb not null default '[]'::jsonb,
  schedule_rule jsonb not null default '{}'::jsonb,
  status text not null default 'published' check (status in ('draft', 'published', 'archived')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, slug)
);
comment on table public.email_templates is 'Rich HTML email template. schedule_rule drives automated sends (e.g. appointment reminders); "test email" and live preview are client-side actions against this row.';

create unique index email_templates_system_slug_key on public.email_templates (slug) where workspace_id is null;
create index email_templates_workspace_idx on public.email_templates (workspace_id);

create table public.sms_templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  name text not null,
  slug text not null,
  body text not null default '' check (char_length(body) <= 1600),
  merge_fields jsonb not null default '[]'::jsonb,
  schedule_rule jsonb not null default '{}'::jsonb,
  status text not null default 'published' check (status in ('draft', 'published', 'archived')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, slug)
);
comment on table public.sms_templates is 'SMS template capped at 1600 chars (~10 segments); character-counter UI reads char_length(body) client-side.';

create unique index sms_templates_system_slug_key on public.sms_templates (slug) where workspace_id is null;
create index sms_templates_workspace_idx on public.sms_templates (workspace_id);

create trigger set_updated_at before update on public.email_templates for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.sms_templates for each row execute function public.set_updated_at();
create trigger audit_email_templates after insert or update or delete on public.email_templates for each row execute function public.audit_trigger_fn();
create trigger audit_sms_templates after insert or update or delete on public.sms_templates for each row execute function public.audit_trigger_fn();

alter table public.email_templates enable row level security;
alter table public.sms_templates enable row level security;

create policy email_templates_select on public.email_templates
  for select using (workspace_id is null or public.is_workspace_member(workspace_id));
create policy email_templates_insert on public.email_templates
  for insert with check (workspace_id is not null and public.is_workspace_admin(workspace_id));
create policy email_templates_update on public.email_templates
  for update using (workspace_id is not null and public.is_workspace_admin(workspace_id));
create policy email_templates_delete on public.email_templates
  for delete using (workspace_id is not null and public.is_workspace_admin(workspace_id));

create policy sms_templates_select on public.sms_templates
  for select using (workspace_id is null or public.is_workspace_member(workspace_id));
create policy sms_templates_insert on public.sms_templates
  for insert with check (workspace_id is not null and public.is_workspace_admin(workspace_id));
create policy sms_templates_update on public.sms_templates
  for update using (workspace_id is not null and public.is_workspace_admin(workspace_id));
create policy sms_templates_delete on public.sms_templates
  for delete using (workspace_id is not null and public.is_workspace_admin(workspace_id));
