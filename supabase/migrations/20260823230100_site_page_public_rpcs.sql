-- Public resolver + lead-capture RPCs for the website/funnel builder, plus
-- the two reorder RPCs the staff-facing builder needs. Mirrors
-- get_public_organizer_template's null-safe shape and
-- capture_public_lead_from_contact_step's lead-capture body (both reused via
-- find_or_create_public_lead/_notify_admins_of_new_public_lead rather than
-- reimplemented), and reorder_organizer_fields's exact validate-then-loop shape.

alter table public.client_service_interests drop constraint client_service_interests_source_check;
alter table public.client_service_interests add constraint client_service_interests_source_check
  check (source = any (array['public_organizer_signup', 'manual', 'portal_basic_info', 'public_site_page']));

create or replace function public.get_public_site_page(p_workspace_slug text, p_page_slug text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_workspace_id uuid;
  v_page record;
  v_result jsonb;
begin
  select id into v_workspace_id from public.workspaces where slug = p_workspace_slug;
  if v_workspace_id is null then
    return null;
  end if;

  select id, title, meta_description, funnel_id
  into v_page
  from public.site_pages
  where workspace_id = v_workspace_id and slug = p_page_slug and status = 'published';

  if v_page.id is null then
    return null;
  end if;

  select jsonb_build_object(
    'workspace_id', v_workspace_id,
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
    -- lead_form sections only store service_ids in config; anon has no
    -- direct SELECT on services, so resolve id -> {id, name} here (this RPC
    -- is SECURITY DEFINER) rather than exposing the services table to anon.
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

revoke all on function public.get_public_site_page(text, text) from public;
grant execute on function public.get_public_site_page(text, text) to anon, authenticated;

create or replace function public.capture_public_lead_from_site_page(
  p_page_id uuid,
  p_section_id uuid,
  p_first_name text,
  p_last_name text,
  p_email text,
  p_phone text,
  p_service_ids uuid[] default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_workspace_id uuid;
  v_client_id uuid;
  v_service_id uuid;
begin
  select p.workspace_id into v_workspace_id
  from public.site_pages p
  join public.site_page_sections s on s.page_id = p.id
  where p.id = p_page_id and s.id = p_section_id and s.section_type = 'lead_form' and p.status = 'published';

  if v_workspace_id is null then
    raise exception 'This page is no longer available';
  end if;
  if p_email is null or btrim(p_email) = '' then
    raise exception 'Email is required';
  end if;

  v_client_id := public.find_or_create_public_lead(v_workspace_id, p_first_name, p_last_name, p_email, p_phone);

  foreach v_service_id in array coalesce(p_service_ids, array[]::uuid[])
  loop
    insert into public.client_service_interests (client_id, workspace_id, service_category_id, service_id, source)
    select v_client_id, v_workspace_id, s.service_category_id, s.id, 'public_site_page'
    from public.services s
    where s.id = v_service_id;
  end loop;

  perform public._notify_admins_of_new_public_lead(v_workspace_id, v_client_id);

  return jsonb_build_object('client_id', v_client_id);
end;
$function$;

revoke all on function public.capture_public_lead_from_site_page(uuid, uuid, text, text, text, text, uuid[]) from public;
grant execute on function public.capture_public_lead_from_site_page(uuid, uuid, text, text, text, text, uuid[]) to anon, authenticated;

create or replace function public.reorder_site_page_sections(p_page_id uuid, p_section_ids uuid[])
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
  select workspace_id into v_workspace_id from public.site_pages where id = p_page_id;
  if v_workspace_id is null then
    raise exception 'page not found';
  end if;
  if not public.has_permission(v_workspace_id, 'site_pages.manage') then
    raise exception 'insufficient permissions to edit this page';
  end if;

  select count(*) into v_total from public.site_page_sections where page_id = p_page_id;
  if coalesce(array_length(p_section_ids, 1), 0) <> v_total then
    raise exception 'reorder list must include every section on this page exactly once';
  end if;

  select count(*) into v_matched from public.site_page_sections where page_id = p_page_id and id = any(p_section_ids);
  if v_matched <> v_total then
    raise exception 'reorder list must include every section on this page exactly once';
  end if;

  foreach v_section_id in array p_section_ids loop
    update public.site_page_sections set display_order = v_idx, updated_at = now() where id = v_section_id;
    v_idx := v_idx + 1;
  end loop;
end;
$function$;

create or replace function public.reorder_funnel_pages(p_funnel_id uuid, p_page_ids uuid[])
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_workspace_id uuid;
  v_page_id uuid;
  v_idx int := 0;
  v_total int;
  v_matched int;
begin
  select workspace_id into v_workspace_id from public.site_funnels where id = p_funnel_id;
  if v_workspace_id is null then
    raise exception 'funnel not found';
  end if;
  if not public.has_permission(v_workspace_id, 'site_pages.manage') then
    raise exception 'insufficient permissions to edit this funnel';
  end if;

  select count(*) into v_total from public.site_pages where funnel_id = p_funnel_id;
  if coalesce(array_length(p_page_ids, 1), 0) <> v_total then
    raise exception 'reorder list must include every page in this funnel exactly once';
  end if;

  select count(*) into v_matched from public.site_pages where funnel_id = p_funnel_id and id = any(p_page_ids);
  if v_matched <> v_total then
    raise exception 'reorder list must include every page in this funnel exactly once';
  end if;

  foreach v_page_id in array p_page_ids loop
    update public.site_pages set funnel_position = v_idx, updated_at = now() where id = v_page_id;
    v_idx := v_idx + 1;
  end loop;
end;
$function$;
