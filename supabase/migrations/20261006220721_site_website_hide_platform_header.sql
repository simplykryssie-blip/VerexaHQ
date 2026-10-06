-- Opt-out of the platform-wide logo header on public site pages, per
-- website. PublicSitePage.tsx always renders a <header> with the owning
-- WORKSPACE's own branding.logo_url on every public page -- correct for a
-- tenant's main firm site, but wrong when a workspace publishes a second,
-- differently-branded site (e.g. a product/microsite) whose own page
-- content already supplies its own header/nav. Off by default so every
-- existing published site (which all rely on this header today -- none of
-- them render their logo any other way) keeps behaving exactly as before.
alter table public.site_websites add column hide_platform_header boolean not null default false;

comment on column public.site_websites.hide_platform_header is
  'Opt-out of the platform-wide logo header on public site pages for this website. Off by default so every existing site keeps showing its workspace logo header unchanged; turn on only for a site whose own page content (e.g. a full custom_html document) already supplies its own header/branding.';

-- Patches the three RPCs that serve a public/preview site page to also
-- return the new column, by programmatically transforming each function's
-- live body rather than hand-retyping it -- keeps every other line byte-
-- identical to what's already deployed.
do $$
declare
  v_def text;
  v_new text;
begin
  -- get_public_site_page_by_domain
  select pg_get_functiondef('public.get_public_site_page_by_domain(text,text)'::regprocedure) into v_def;
  v_new := replace(v_def, 'sw.header_background, w.slug as workspace_slug', 'sw.header_background, sw.hide_platform_header, w.slug as workspace_slug');
  v_new := replace(v_new, E'''header_background'', v_website.header_background\n    ),', E'''header_background'', v_website.header_background,\n      ''hide_platform_header'', v_website.hide_platform_header\n    ),');
  if v_new = v_def then raise exception 'no change applied to get_public_site_page_by_domain'; end if;
  if v_new !~ 'hide_platform_header' then raise exception 'hide_platform_header missing after patch (by_domain)'; end if;
  execute v_new;

  -- get_public_site_page
  select pg_get_functiondef('public.get_public_site_page(text,text,text)'::regprocedure) into v_def;
  v_new := replace(v_def, E'body_tracking_code, header_background\n  into v_website', E'body_tracking_code, header_background, hide_platform_header\n  into v_website');
  v_new := replace(v_new, E'''header_background'', v_website.header_background\n    ),', E'''header_background'', v_website.header_background,\n      ''hide_platform_header'', v_website.hide_platform_header\n    ),');
  if v_new = v_def then raise exception 'no change applied to get_public_site_page'; end if;
  if v_new !~ 'hide_platform_header' then raise exception 'hide_platform_header missing after patch (get_public_site_page)'; end if;
  execute v_new;

  -- get_site_page_preview
  select pg_get_functiondef('public.get_site_page_preview(uuid)'::regprocedure) into v_def;
  v_new := replace(v_def, E'body_tracking_code, header_background\n  into v_website', E'body_tracking_code, header_background, hide_platform_header\n  into v_website');
  v_new := replace(v_new, E'''header_background'', v_website.header_background\n    ),', E'''header_background'', v_website.header_background,\n      ''hide_platform_header'', v_website.hide_platform_header\n    ),');
  if v_new = v_def then raise exception 'no change applied to get_site_page_preview'; end if;
  if v_new !~ 'hide_platform_header' then raise exception 'hide_platform_header missing after patch (preview)'; end if;
  execute v_new;
end $$;
