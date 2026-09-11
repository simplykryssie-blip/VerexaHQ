-- Generalizes get_ero_connected_partners/get_my_ero_connection (built for
-- the ero_ptin-only Partners page) to cover all three firm_connections
-- tiers (ero_ptin, service_bureau_ero, service_bureau_ptin), so the
-- Connections section folded into Settings > Users & Staff can reuse the
-- same RLS-safe RPCs instead of the still-broken embedded select
-- (workspaces:child_workspace_id(name)/workspaces:parent_workspace_id(name))
-- that only resolves when the viewer happens to also belong to the other
-- workspace. p_relationship_types defaults to ero_ptin-only so the Partners
-- page (which only ever wants that one tier) needs no call-site change.

drop function if exists public.get_ero_connected_partners(uuid);

create function public.get_ero_connected_partners(p_workspace_id uuid, p_relationship_types text[] default array['ero_ptin'])
returns table (
  connection_id uuid,
  child_workspace_id uuid,
  name text,
  relationship_type text,
  status text,
  phone text,
  primary_contact_email text,
  website text,
  mailing_address text,
  billing_responsibility text,
  shares_communications_identity boolean,
  allows_branding_override boolean,
  notes text,
  created_at timestamptz,
  responded_at timestamptz
)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  if not public.is_workspace_admin(p_workspace_id) then
    raise exception 'Only a workspace admin can view connected partners';
  end if;

  return query
    select
      fc.id, fc.child_workspace_id, coalesce(cw.name, 'Pending invite'), fc.relationship_type, fc.status,
      cw.phone, cw.primary_contact_email, cw.website, cw.mailing_address,
      fc.billing_responsibility, fc.shares_communications_identity, fc.allows_branding_override,
      fc.notes, fc.created_at, fc.responded_at
    from public.firm_connections fc
    left join public.workspaces cw on cw.id = fc.child_workspace_id
    where fc.parent_workspace_id = p_workspace_id
      and fc.relationship_type = any(p_relationship_types)
    order by (fc.status = 'active') desc, cw.name nulls last;
end;
$function$;

revoke all on function public.get_ero_connected_partners(uuid, text[]) from public, anon;
grant execute on function public.get_ero_connected_partners(uuid, text[]) to authenticated;

drop function if exists public.get_my_ero_connection(uuid);

create function public.get_my_ero_connection(p_workspace_id uuid)
returns table (
  connection_id uuid,
  ero_workspace_id uuid,
  name text,
  relationship_type text,
  phone text,
  primary_contact_email text,
  website text,
  billing_responsibility text,
  shares_communications_identity boolean,
  allows_branding_override boolean
)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  if not public.is_workspace_member(p_workspace_id) then
    raise exception 'Only a member of this workspace can view its ERO connection';
  end if;

  return query
    select
      fc.id, fc.parent_workspace_id, pw.name, fc.relationship_type, pw.phone, pw.primary_contact_email, pw.website,
      fc.billing_responsibility, fc.shares_communications_identity, fc.allows_branding_override
    from public.firm_connections fc
    join public.workspaces pw on pw.id = fc.parent_workspace_id
    where fc.child_workspace_id = p_workspace_id
      and fc.relationship_type in ('ero_ptin', 'service_bureau_ero', 'service_bureau_ptin')
      and fc.status = 'active'
    limit 1;
end;
$function$;

revoke all on function public.get_my_ero_connection(uuid) from public, anon;
grant execute on function public.get_my_ero_connection(uuid) to authenticated;
