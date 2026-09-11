-- Popups for the website builder -- new feature, no prior art in the schema.
-- Modeled as a lightweight sibling of site_pages: its own section list
-- (site_popup_sections, mirroring site_page_sections but restricted to a
-- popup-appropriate subset of section types), rendered through the same
-- SectionRenderer pipeline pages already use, inside a client-side modal
-- armed by one of four triggers and suppressed per the chosen display
-- frequency. Reuses the existing site_pages.manage permission (same
-- convention the funnels migration itself calls out) rather than a new one.

create table public.site_popups (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  website_id uuid not null references public.site_websites(id) on delete cascade,
  name text not null,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  trigger_type text not null default 'after_delay' check (trigger_type in ('on_load', 'after_delay', 'exit_intent', 'scroll_percent')),
  -- Seconds for after_delay, percent (1-100) for scroll_percent; unused/null
  -- for on_load and exit_intent.
  trigger_value numeric,
  display_frequency text not null default 'once_per_session' check (display_frequency in ('every_visit', 'once_per_session', 'once_ever', 'every_n_days')),
  frequency_days numeric,
  -- null/empty = every page on this website; otherwise a specific list of
  -- site_pages.id. Kept as a plain array (like site_pages.funnel_id's
  -- deliberately simple shape) rather than a join table -- targeting a
  -- popup to a handful of pages doesn't need one.
  target_page_ids uuid[],
  background_color text,
  custom_css text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index site_popups_workspace_idx on public.site_popups (workspace_id);
create index site_popups_website_idx on public.site_popups (website_id);

alter table public.site_popups enable row level security;

create policy site_popups_select on public.site_popups
  for select using (public.is_workspace_member(workspace_id));
create policy site_popups_insert on public.site_popups
  for insert with check (public.has_permission(workspace_id, 'site_pages.manage'));
create policy site_popups_update on public.site_popups
  for update using (public.has_permission(workspace_id, 'site_pages.manage'));
create policy site_popups_delete on public.site_popups
  for delete using (public.has_permission(workspace_id, 'site_pages.manage'));

create table public.site_popup_sections (
  id uuid primary key default gen_random_uuid(),
  popup_id uuid not null references public.site_popups(id) on delete cascade,
  -- Deliberately narrower than site_page_sections' allow-list -- hero,
  -- testimonial, faq, text_image, footer, booking_widget, and pricing_table
  -- are page-only layouts that don't fit a popup's small footprint.
  section_type text not null check (section_type in (
    'rich_text', 'image', 'cta_button', 'organizer_form', 'spacer', 'custom_html'
  )),
  display_order int not null,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint site_popup_sections_order_unique unique (popup_id, display_order) deferrable initially deferred
);

create index site_popup_sections_popup_idx on public.site_popup_sections (popup_id, display_order);

alter table public.site_popup_sections enable row level security;

create policy site_popup_sections_select on public.site_popup_sections
  for select using (
    exists (select 1 from public.site_popups p where p.id = site_popup_sections.popup_id and public.is_workspace_member(p.workspace_id))
  );
create policy site_popup_sections_insert on public.site_popup_sections
  for insert with check (
    exists (select 1 from public.site_popups p where p.id = site_popup_sections.popup_id and public.has_permission(p.workspace_id, 'site_pages.manage'))
  );
create policy site_popup_sections_update on public.site_popup_sections
  for update using (
    exists (select 1 from public.site_popups p where p.id = site_popup_sections.popup_id and public.has_permission(p.workspace_id, 'site_pages.manage'))
  );
create policy site_popup_sections_delete on public.site_popup_sections
  for delete using (
    exists (select 1 from public.site_popups p where p.id = site_popup_sections.popup_id and public.has_permission(p.workspace_id, 'site_pages.manage'))
  );

-- Mirrors reorder_site_page_sections exactly.
create function public.reorder_site_popup_sections(p_popup_id uuid, p_section_ids uuid[])
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_workspace_id uuid;
  v_section_id uuid;
  v_idx int := 0;
  v_total int;
  v_matched int;
begin
  select workspace_id into v_workspace_id from public.site_popups where id = p_popup_id;
  if v_workspace_id is null then
    raise exception 'popup not found';
  end if;
  if not public.has_permission(v_workspace_id, 'site_pages.manage') then
    raise exception 'insufficient permissions to edit this popup';
  end if;

  select count(*) into v_total from public.site_popup_sections where popup_id = p_popup_id;
  if coalesce(array_length(p_section_ids, 1), 0) <> v_total then
    raise exception 'reorder list must include every section on this popup exactly once';
  end if;

  select count(*) into v_matched from public.site_popup_sections where popup_id = p_popup_id and id = any(p_section_ids);
  if v_matched <> v_total then
    raise exception 'reorder list must include every section on this popup exactly once';
  end if;

  foreach v_section_id in array p_section_ids loop
    update public.site_popup_sections set display_order = v_idx, updated_at = now() where id = v_section_id;
    v_idx := v_idx + 1;
  end loop;
end;
$function$;

-- Public resolver -- mirrors get_public_site_page's null-safe, anon-callable
-- shape. Takes the page id already resolved by get_public_site_page (or
-- get_public_site_page_by_domain) rather than re-resolving slugs, since the
-- caller already has it once the page itself has loaded.
create function public.get_active_site_popups(p_website_id uuid, p_page_id uuid)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', p.id,
      'name', p.name,
      'trigger_type', p.trigger_type,
      'trigger_value', p.trigger_value,
      'display_frequency', p.display_frequency,
      'frequency_days', p.frequency_days,
      'background_color', p.background_color,
      'custom_css', p.custom_css,
      'sections', coalesce((
        select jsonb_agg(
          jsonb_build_object('id', s.id, 'section_type', s.section_type, 'display_order', s.display_order, 'config', s.config)
          order by s.display_order
        )
        from public.site_popup_sections s
        where s.popup_id = p.id
      ), '[]'::jsonb)
    )
  ), '[]'::jsonb)
  from public.site_popups p
  where p.website_id = p_website_id
    and p.status = 'published'
    and (p.target_page_ids is null or array_length(p.target_page_ids, 1) is null or p_page_id = any(p.target_page_ids));
$function$;

revoke all on function public.get_active_site_popups(uuid, uuid) from public;
grant execute on function public.get_active_site_popups(uuid, uuid) to anon, authenticated;
