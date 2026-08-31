-- get_public_site_page's header_background column read (added in
-- 20260826010000, the migration whose own comment explains why: a
-- workspace's only logo is often the sidebar wordmark, made for a dark
-- sidebar, so it disappears on the header's default plain/light
-- background) was silently dropped when 20260826190000 and then
-- 20260827010000 each rewrote this function from an older base to add
-- their own fields -- neither carried header_background forward. That
-- regression is the actual cause: the public header always rendered on a
-- transparent/light background instead of the intended dark backdrop, so
-- a light sidebar-style logo went invisible against it. Re-adding it here,
-- on top of the current (0827) function bodies, plus doing the same for
-- get_public_site_page_by_domain, which has the identical gap.
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

  select id, title, meta_description, funnel_id, background_color, custom_css, custom_js, schema_markup
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
    'page', jsonb_build_object(
      'id', v_page.id, 'title', v_page.title, 'meta_description', v_page.meta_description,
      'background_color', v_page.background_color, 'custom_css', v_page.custom_css,
      'custom_js', v_page.custom_js, 'schema_markup', v_page.schema_markup
    ),
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
        jsonb_build_object('id', s.id, 'section_type', s.section_type, 'display_order', s.display_order, 'config', s.config)
        order by s.display_order
      )
      from public.site_page_sections s
      where s.page_id = v_page.id
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$function$;

create or replace function public.get_public_site_page_by_domain(p_domain text, p_page_slug text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_workspace_id uuid;
  v_workspace_slug text;
  v_website record;
  v_page record;
  v_result jsonb;
begin
  select sw.id, sw.workspace_id, sw.name, sw.slug, sw.favicon_url, sw.head_tracking_code, sw.body_tracking_code, sw.header_background, w.slug as workspace_slug
  into v_website
  from public.site_websites sw
  join public.workspaces w on w.id = sw.workspace_id
  where lower(sw.custom_domain) = lower(p_domain);

  if v_website.id is null then
    return null;
  end if;

  v_workspace_id := v_website.workspace_id;
  v_workspace_slug := v_website.workspace_slug;

  select id, title, meta_description, funnel_id, background_color, custom_css, custom_js, schema_markup
  into v_page
  from public.site_pages
  where website_id = v_website.id and slug = p_page_slug and status = 'published';

  if v_page.id is null then
    return null;
  end if;

  select jsonb_build_object(
    'workspace_id', v_workspace_id,
    'workspace_slug', v_workspace_slug,
    'website_slug', v_website.slug,
    'website', jsonb_build_object(
      'id', v_website.id, 'name', v_website.name, 'favicon_url', v_website.favicon_url,
      'head_tracking_code', v_website.head_tracking_code, 'body_tracking_code', v_website.body_tracking_code,
      'header_background', v_website.header_background
    ),
    'page', jsonb_build_object(
      'id', v_page.id, 'title', v_page.title, 'meta_description', v_page.meta_description,
      'background_color', v_page.background_color, 'custom_css', v_page.custom_css,
      'custom_js', v_page.custom_js, 'schema_markup', v_page.schema_markup
    ),
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
        jsonb_build_object('id', s.id, 'section_type', s.section_type, 'display_order', s.display_order, 'config', s.config)
        order by s.display_order
      )
      from public.site_page_sections s
      where s.page_id = v_page.id
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$function$;

-- Verexa HQ's own marketing site's only uploaded logo is the sidebar
-- wordmark (light-on-dark). Give its public header the same dark navy as
-- the app's own sidebar (branding.sidebar_bg_color for this workspace) in
-- place of the old, unrelated dark-cyan gradient, so the logo is actually
-- visible and the marketing site's chrome matches the app it's selling.
update public.site_websites
set header_background = '#112555'
where id = '0892c4b4-bbe3-479f-bd58-fd7d48872f93';
