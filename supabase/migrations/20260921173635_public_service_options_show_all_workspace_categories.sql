-- get_public_service_options previously special-cased the QuickBooks intake
-- template by name to only show the "QuickBooks & Bookkeeping" category,
-- excluding every other service category for the workspace. Per the firm's
-- explicit request, this public intake form should offer every published,
-- portal-visible service in their catalog, matching every other organizer's
-- (unrestricted) behavior -- so the special case is removed entirely.
create or replace function public.get_public_service_options(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_workspace_id uuid;
begin
  select ot.workspace_id
    into v_workspace_id
  from public.organizer_templates ot
  where ot.public_token = p_token
    and ot.is_public = true
    and ot.status = 'published';

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
    where (sc.workspace_id is null or sc.workspace_id = v_workspace_id)
  ), '[]'::jsonb);
end;
$function$;

-- Make Monthly Bookkeeping visible in service pickers (portal, and this
-- public organizer intake) like every other published service in this
-- workspace already is -- it was the one exception.
update public.services
set is_portal_visible = true
where id = 'a2000000-0000-0000-0000-000000000002'
  and workspace_id = '2896bf43-95db-420f-9bb5-8854f537bbd1';
