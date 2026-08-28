-- Replaces the website builder's old fixed-schema "lead_form" section with
-- "organizer_form", which embeds a real (already-existing) public organizer
-- template form inline on a page instead of a hardcoded name/email/phone
-- form. The organizer-template public-link flow (get_public_organizer_template,
-- submit_public_organizer_response, etc.) already handles lead capture, so
-- no new RPCs are needed here -- just retiring the lead_form-specific ones
-- and widening the section_type allow-list.

-- capture_public_lead_from_site_page was only ever called from the
-- lead_form section component, which no longer exists.
drop function if exists public.capture_public_lead_from_site_page(uuid, uuid, text, text, text, text, uuid[]);

-- Dropped now, re-added below (with organizer_form instead of lead_form)
-- after the data migration converts the last lead_form rows.
alter table public.site_page_sections drop constraint site_page_sections_section_type_check;

-- Drops the lead_form-specific "services" enrichment case -- organizer_form
-- sections carry their own public_token in config and resolve their
-- template client-side via get_public_organizer_template, so there's
-- nothing left for this RPC to special-case by section_type.
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

  select id, name, favicon_url, head_tracking_code, body_tracking_code
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
      'head_tracking_code', v_website.head_tracking_code, 'body_tracking_code', v_website.body_tracking_code
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
  select sw.id, sw.workspace_id, sw.name, sw.slug, sw.favicon_url, sw.head_tracking_code, sw.body_tracking_code, w.slug as workspace_slug
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
      'head_tracking_code', v_website.head_tracking_code, 'body_tracking_code', v_website.body_tracking_code
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

-- Verexa HQ's own marketing site (workspace 74321fb2-9a18-4625-ab12-01c98e888667)
-- has two live, published lead_form sections -- the "About" page's contact
-- form and the "Start Your Free Trial" signup form. Build a real organizer
-- template for each (matching the original heading/subheading/thank-you
-- copy) and swap both sections over, so nothing on the live site breaks.
do $$
declare
  v_workspace_id uuid := '74321fb2-9a18-4625-ab12-01c98e888667';
  v_contact_id uuid := gen_random_uuid();
  v_trial_id uuid := gen_random_uuid();
  v_contact_token uuid;
  v_trial_token uuid;
begin
  insert into public.organizer_templates (id, workspace_id, name, slug, description, status, is_public, requires_portal_signup)
  values (v_contact_id, v_workspace_id, 'Get in Touch', 'get-in-touch', 'Questions about Verexa HQ? Send us a message and we''ll get back to you.', 'published', true, false)
  returning public_token into v_contact_token;

  insert into public.organizer_fields (organizer_template_id, field_type, label, display_order, is_required, options) values
  (v_contact_id, 'paragraph', 'How can we help?', 0, false, '[]');

  insert into public.organizer_templates (id, workspace_id, name, slug, description, status, is_public, requires_portal_signup)
  values (v_trial_id, v_workspace_id, 'Start Your Free Trial', 'start-your-free-trial', 'Takes less than a minute -- no credit card required.', 'published', true, false)
  returning public_token into v_trial_token;

  insert into public.organizer_fields (organizer_template_id, field_type, label, display_order, is_required, options) values
  (v_trial_id, 'short_text', 'Firm or business name', 0, false, '[]');

  -- The old config's background/button_background/button_text_color keys
  -- were never actually read by LeadFormSection or any other renderer, so
  -- nothing visual is lost by dropping them here.
  update public.site_page_sections
  set section_type = 'organizer_form',
      config = jsonb_build_object(
        'template_id', v_contact_id,
        'public_token', v_contact_token,
        'template_name', 'Get in Touch',
        'on_submit', jsonb_build_object(
          'action', 'inline_thank_you',
          'thank_you_heading', 'Thanks for reaching out!',
          'thank_you_body', 'A Verexa team member will get back to you shortly.'
        )
      )
  where page_id = 'c09b545b-8445-413f-81bc-1292abd93e40' and section_type = 'lead_form';

  update public.site_page_sections
  set section_type = 'organizer_form',
      config = jsonb_build_object(
        'template_id', v_trial_id,
        'public_token', v_trial_token,
        'template_name', 'Start Your Free Trial',
        'on_submit', jsonb_build_object(
          'action', 'inline_thank_you',
          'thank_you_heading', 'You''re In!',
          'thank_you_body', 'A Verexa team member will reach out shortly to help you get set up. Keep an eye on your inbox.'
        )
      )
  where page_id = 'd4f5c664-2584-4fe8-82e0-42e44db52de2' and section_type = 'lead_form';
end $$;

-- Re-add the section_type allow-list now that no row is still 'lead_form'.
alter table public.site_page_sections add constraint site_page_sections_section_type_check
  check (section_type = any (array['hero'::text, 'rich_text'::text, 'image'::text, 'text_image'::text, 'testimonial'::text, 'faq'::text, 'organizer_form'::text, 'cta_button'::text, 'spacer'::text, 'footer'::text, 'custom_html'::text]));
