-- services.is_portal_visible has existed since the Services settings UI
-- shipped, but neither client-facing "what do you need help with?" picker
-- actually checked it -- both only filtered on status = 'published', so
-- unchecking "Visible in the public/portal service picker" did nothing.
-- Add the missing filter to both.
create or replace function public.get_public_service_options(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_workspace_id uuid;
begin
  select ot.workspace_id into v_workspace_id
  from public.organizer_templates ot
  where ot.public_token = p_token and ot.is_public = true and ot.status = 'published';

  if v_workspace_id is null then
    return '[]'::jsonb;
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', sc.id,
      'name', sc.name,
      'services', (
        select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name) order by s.display_order), '[]'::jsonb)
        from public.services s
        where s.service_category_id = sc.id
          and s.status = 'published'
          and s.is_portal_visible = true
          and (s.workspace_id is null or s.workspace_id = v_workspace_id)
      )
    ) order by sc.display_order)
    from public.service_categories sc
    where sc.workspace_id is null or sc.workspace_id = v_workspace_id
  ), '[]'::jsonb);
end;
$function$;

create or replace function public.get_portal_service_options()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_workspace_id uuid;
begin
  select workspace_id into v_workspace_id
  from public.client_portal_users
  where user_id = auth.uid() and status = 'active'
  limit 1;

  if v_workspace_id is null then
    return '[]'::jsonb;
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', sc.id,
      'name', sc.name,
      'services', (
        select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name) order by s.display_order), '[]'::jsonb)
        from public.services s
        where s.service_category_id = sc.id
          and s.status = 'published'
          and s.is_portal_visible = true
          and (s.workspace_id is null or s.workspace_id = v_workspace_id)
      )
    ) order by sc.display_order)
    from public.service_categories sc
    where sc.workspace_id is null or sc.workspace_id = v_workspace_id
  ), '[]'::jsonb);
end;
$function$;
