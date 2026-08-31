-- The public site header always rendered on a plain white/light background.
-- A workspace's sidebar_logo_url (what branding.logo_url resolves to here) is
-- designed for a dark sidebar, so it can be nearly illegible dropped onto a
-- white header -- e.g. a light/metallic wordmark with no contrast. Adding a
-- per-website override (rather than changing the shared header default)
-- keeps every other site's plain header exactly as it was.
alter table public.site_websites add column header_background text;

create or replace function public.get_public_site_page(p_workspace_slug text, p_website_slug text, p_page_slug text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_workspace_id uuid;
  v_website record;
  v_page record;
  v_result jsonb;
begin
  select id into v_workspace_id from public.workspaces where slug = p_workspace_slug;
  if v_workspace_id is null then
    return null;
  end if;

  select id, name, favicon_url, head_tracking_code, body_tracking_code, header_background
  into v_website
  from public.site_websites
  where workspace_id = v_workspace_id and slug = p_website_slug;

  if v_website.id is null then
    return null;
  end if;

  select id, title, meta_description, funnel_id
  into v_page
  from public.site_pages
  where website_id = v_website.id and slug = p_page_slug and status = 'published';

  if v_page.id is null then
    return null;
  end if;

  select jsonb_build_object(
    'workspace_id', v_workspace_id,
    'website', jsonb_build_object(
      'id', v_website.id, 'name', v_website.name, 'favicon_url', v_website.favicon_url,
      'head_tracking_code', v_website.head_tracking_code, 'body_tracking_code', v_website.body_tracking_code,
      'header_background', v_website.header_background
    ),
    'page', jsonb_build_object('id', v_page.id, 'title', v_page.title, 'meta_description', v_page.meta_description),
    'branding', (
      select jsonb_build_object(
        'logo_url', coalesce(b.portal_logo_url, b.sidebar_logo_url),
        'primary_color', b.primary_color,
        'secondary_color', b.secondary_color,
        'support_email', b.support_email,
        'support_phone', b.support_phone,
        'display_name', b.display_name
      )
      from public.branding b
      where b.workspace_id = v_workspace_id
    ),
    'funnel', (
      case when v_page.funnel_id is null then null else (
        select jsonb_build_object(
          'id', f.id,
          'name', f.name,
          'pages', coalesce((
            select jsonb_agg(jsonb_build_object('id', sp.id, 'slug', sp.slug, 'title', sp.title, 'position', sp.funnel_position) order by sp.funnel_position)
            from public.site_pages sp
            where sp.funnel_id = f.id and sp.status = 'published'
          ), '[]'::jsonb)
        )
        from public.site_funnels f
        where f.id = v_page.funnel_id
      ) end
    ),
    'sections', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', s.id, 'section_type', s.section_type, 'display_order', s.display_order,
          'config', case when s.section_type = 'lead_form' then
            s.config || jsonb_build_object('services', coalesce((
              select jsonb_agg(jsonb_build_object('id', sv.id, 'name', sv.name) order by sv.display_order)
              from public.services sv
              where sv.id in (select (jsonb_array_elements_text(coalesce(s.config->'service_ids', '[]'::jsonb)))::uuid)
            ), '[]'::jsonb))
          else s.config end
        ) order by s.display_order
      )
      from public.site_page_sections s
      where s.page_id = v_page.id
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$function$;
