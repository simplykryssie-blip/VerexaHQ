-- Staff-facing counterpart to get_public_site_page(): same jsonb shape, but
-- looked up by page id (not slugs) and with no `status = 'published'` filter,
-- so a draft page can be rendered through the exact same PublicSitePage
-- component real visitors get -- "what will this look like once published"
-- without requiring a publish first. Access is gated by is_workspace_member()
-- on the page's own workspace rather than by publish status; also returns
-- workspace_slug/website_slug (get_public_site_page doesn't need them since
-- the caller already has them from the URL, but the preview route is keyed
-- off page id alone).
create or replace function public.get_site_page_preview(p_page_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_page record;
  v_website record;
  v_workspace_slug text;
  v_result jsonb;
begin
  select id, website_id, title, meta_description, funnel_id, background_color, custom_css, custom_js, schema_markup
  into v_page
  from public.site_pages
  where id = p_page_id;

  if v_page.id is null then
    return null;
  end if;

  select id, workspace_id, slug, name, favicon_url, head_tracking_code, body_tracking_code, header_background
  into v_website
  from public.site_websites
  where id = v_page.website_id;

  if v_website.id is null or not public.is_workspace_member(v_website.workspace_id) then
    return null;
  end if;

  select slug into v_workspace_slug from public.workspaces where id = v_website.workspace_id;

  select jsonb_build_object(
    'workspace_id', v_website.workspace_id,
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
      where b.workspace_id = v_website.workspace_id
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
