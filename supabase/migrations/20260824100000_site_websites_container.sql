-- Pages/funnels previously lived directly under a workspace with no
-- grouping above them. Real usage (per GHL's own "Websites" feature, which
-- this is explicitly modeled on) needs a workspace to run more than one
-- distinct website (e.g. a separate site for a sub-brand or campaign), each
-- with its own name/URL segment/favicon/tracking scripts. Introduces
-- site_websites as that container and moves pages/funnels under it.

create table public.site_websites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  slug text not null,
  favicon_url text,
  head_tracking_code text,
  body_tracking_code text,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint site_websites_workspace_slug_unique unique (workspace_id, slug)
);

create index site_websites_workspace_idx on public.site_websites (workspace_id);

alter table public.site_websites enable row level security;

create policy site_websites_select on public.site_websites
  for select using (public.is_workspace_member(workspace_id));
create policy site_websites_insert on public.site_websites
  for insert with check (public.has_permission(workspace_id, 'site_pages.manage'));
create policy site_websites_update on public.site_websites
  for update using (public.has_permission(workspace_id, 'site_pages.manage'));
create policy site_websites_delete on public.site_websites
  for delete using (public.has_permission(workspace_id, 'site_pages.manage'));

-- Backfill: any workspace that already has pages or funnels gets one
-- default website, and every existing row is attached to it -- preserves
-- the couple of draft pages already created before this container existed.
insert into public.site_websites (workspace_id, name, slug, status)
select distinct workspace_id, 'Main Website', 'main', 'draft'
from public.site_pages
union
select distinct workspace_id, 'Main Website', 'main', 'draft'
from public.site_funnels;

alter table public.site_pages add column website_id uuid references public.site_websites(id) on delete cascade;
update public.site_pages sp
set website_id = sw.id
from public.site_websites sw
where sw.workspace_id = sp.workspace_id and sw.slug = 'main';
alter table public.site_pages alter column website_id set not null;

alter table public.site_funnels add column website_id uuid references public.site_websites(id) on delete cascade;
update public.site_funnels sf
set website_id = sw.id
from public.site_websites sw
where sw.workspace_id = sf.workspace_id and sw.slug = 'main';
alter table public.site_funnels alter column website_id set not null;

-- Page slugs only need to be unique within a website now, not across the
-- whole workspace.
alter table public.site_pages drop constraint site_pages_workspace_slug_unique;
alter table public.site_pages add constraint site_pages_website_slug_unique unique (website_id, slug);

create index site_pages_website_idx on public.site_pages (website_id);
create index site_funnels_website_idx on public.site_funnels (website_id);
