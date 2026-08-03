-- Phase 2: Firm Configuration Engine -- Service Catalog
-- Services are the hub: each one wires together a Process, Pipeline,
-- Organizer, Document Request, Engagement Letter, Pricing Rule, and Billing
-- Rule. Unlimited services, never hardcoded.

create table public.service_categories (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  name text not null,
  slug text not null,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, slug)
);
comment on table public.service_categories is 'Groups services for catalog display (e.g. Individual, Business, Amended, Planning).';

create unique index service_categories_system_slug_key on public.service_categories (slug) where workspace_id is null;
create index service_categories_workspace_idx on public.service_categories (workspace_id, display_order);

create table public.services (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  service_category_id uuid references public.service_categories(id) on delete set null,
  name text not null,
  slug text not null,
  description text,
  estimated_duration_minutes integer,
  default_price numeric(12, 2),
  pricing_rule_id uuid references public.pricing_rules(id) on delete set null,
  billing_rule_id uuid references public.billing_rules(id) on delete set null,
  process_id uuid references public.processes(id) on delete set null,
  pipeline_id uuid references public.pipelines(id) on delete set null,
  organizer_template_id uuid references public.organizer_templates(id) on delete set null,
  document_request_template_id uuid references public.document_request_templates(id) on delete set null,
  engagement_letter_template_id uuid references public.engagement_letter_templates(id) on delete set null,
  is_bookable boolean not null default false,
  is_portal_visible boolean not null default true,
  requires_organizer boolean not null default false,
  requires_engagement_letter boolean not null default false,
  requires_documents boolean not null default false,
  requires_signature boolean not null default false,
  requires_review boolean not null default false,
  requires_invoice boolean not null default true,
  requires_payment_before_release boolean not null default false,
  display_order integer not null default 0,
  tags text[] not null default '{}',
  status text not null default 'published' check (status in ('draft', 'published', 'archived')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, slug)
);
comment on table public.services is 'A sellable, bookable, or portal-visible offering. Ties together the Process, Pipeline, Organizer, Document Request, Engagement Letter, Pricing Rule, and Billing Rule that drive a Case created for this service.';

create unique index services_system_slug_key on public.services (slug) where workspace_id is null;
create index services_workspace_idx on public.services (workspace_id, display_order);
create index services_category_idx on public.services (service_category_id);
create index services_tags_idx on public.services using gin (tags);

create trigger set_updated_at before update on public.service_categories for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.services for each row execute function public.set_updated_at();
create trigger audit_service_categories after insert or update or delete on public.service_categories for each row execute function public.audit_trigger_fn();
create trigger audit_services after insert or update or delete on public.services for each row execute function public.audit_trigger_fn();

alter table public.service_categories enable row level security;
alter table public.services enable row level security;

create policy service_categories_select on public.service_categories
  for select using (workspace_id is null or public.is_workspace_member(workspace_id));
create policy service_categories_insert on public.service_categories
  for insert with check (workspace_id is not null and public.is_workspace_admin(workspace_id));
create policy service_categories_update on public.service_categories
  for update using (workspace_id is not null and public.is_workspace_admin(workspace_id));
create policy service_categories_delete on public.service_categories
  for delete using (workspace_id is not null and public.is_workspace_admin(workspace_id));

create policy services_select on public.services
  for select using (workspace_id is null or public.is_workspace_member(workspace_id));
create policy services_insert on public.services
  for insert with check (workspace_id is not null and public.is_workspace_admin(workspace_id));
create policy services_update on public.services
  for update using (workspace_id is not null and public.is_workspace_admin(workspace_id));
create policy services_delete on public.services
  for delete using (workspace_id is not null and public.is_workspace_admin(workspace_id));
