-- Website/funnel builder, phase 1 (platform-hosted, no custom domains yet).
-- Staff build public marketing pages from a curated section library, chain
-- them into linear funnels, and attach a lead-capture form section that
-- creates real CRM leads (see the companion RPC migration). Mirrors the
-- pipelines.manage permission shape (20260822250000_pipelines_manage_permission.sql)
-- rather than is_workspace_admin, since builder access should follow the
-- same granted-permission model every other configurable resource uses.

create table public.site_funnels (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index site_funnels_workspace_idx on public.site_funnels (workspace_id);

alter table public.site_funnels enable row level security;

create policy site_funnels_select on public.site_funnels
  for select using (public.is_workspace_member(workspace_id));
create policy site_funnels_insert on public.site_funnels
  for insert with check (public.has_permission(workspace_id, 'site_pages.manage'));
create policy site_funnels_update on public.site_funnels
  for update using (public.has_permission(workspace_id, 'site_pages.manage'));
create policy site_funnels_delete on public.site_funnels
  for delete using (public.has_permission(workspace_id, 'site_pages.manage'));

-- A page belongs to at most one funnel (funnel_id/funnel_position live here
-- rather than in a join table) -- every funnel described so far is a strictly
-- linear sequence (landing -> application -> thank-you), so a page being
-- reusable across multiple funnels isn't a real requirement yet. Revisit with
-- an actual funnel_pages join table if that changes.
create table public.site_pages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  funnel_id uuid references public.site_funnels(id) on delete set null,
  funnel_position int,
  title text not null,
  slug text not null,
  meta_description text,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint site_pages_workspace_slug_unique unique (workspace_id, slug),
  -- Deferred so reorder_funnel_pages can write new positions one row at a
  -- time without a mid-loop collision (same trick as
  -- organizer_fields_organizer_template_id_display_order_key).
  constraint site_pages_funnel_position_unique unique (funnel_id, funnel_position) deferrable initially deferred
);

create index site_pages_workspace_idx on public.site_pages (workspace_id);
create index site_pages_funnel_idx on public.site_pages (funnel_id, funnel_position);

alter table public.site_pages enable row level security;

create policy site_pages_select on public.site_pages
  for select using (public.is_workspace_member(workspace_id));
create policy site_pages_insert on public.site_pages
  for insert with check (public.has_permission(workspace_id, 'site_pages.manage'));
create policy site_pages_update on public.site_pages
  for update using (public.has_permission(workspace_id, 'site_pages.manage'));
create policy site_pages_delete on public.site_pages
  for delete using (public.has_permission(workspace_id, 'site_pages.manage'));

create table public.site_page_sections (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.site_pages(id) on delete cascade,
  section_type text not null check (section_type in (
    'hero', 'rich_text', 'image', 'text_image', 'testimonial',
    'faq', 'lead_form', 'cta_button', 'spacer', 'footer'
  )),
  display_order int not null,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Deferred so reorder_site_page_sections can write new positions one row
  -- at a time without a mid-loop collision.
  constraint site_page_sections_order_unique unique (page_id, display_order) deferrable initially deferred
);

create index site_page_sections_page_idx on public.site_page_sections (page_id, display_order);

alter table public.site_page_sections enable row level security;

create policy site_page_sections_select on public.site_page_sections
  for select using (
    exists (select 1 from public.site_pages p where p.id = site_page_sections.page_id and public.is_workspace_member(p.workspace_id))
  );
create policy site_page_sections_insert on public.site_page_sections
  for insert with check (
    exists (select 1 from public.site_pages p where p.id = site_page_sections.page_id and public.has_permission(p.workspace_id, 'site_pages.manage'))
  );
create policy site_page_sections_update on public.site_page_sections
  for update using (
    exists (select 1 from public.site_pages p where p.id = site_page_sections.page_id and public.has_permission(p.workspace_id, 'site_pages.manage'))
  );
create policy site_page_sections_delete on public.site_page_sections
  for delete using (
    exists (select 1 from public.site_pages p where p.id = site_page_sections.page_id and public.has_permission(p.workspace_id, 'site_pages.manage'))
  );

insert into public.permissions (key, category, description)
values ('site_pages.manage', 'site_pages', 'Build and publish website pages, funnels, and lead-capture forms');

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.workspace_id is null
  and r.slug in ('owner', 'admin', 'ero', 'manager', 'staff')
  and p.key = 'site_pages.manage';
