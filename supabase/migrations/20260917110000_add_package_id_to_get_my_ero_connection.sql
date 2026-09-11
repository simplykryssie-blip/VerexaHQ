-- The buyer-side firm-profile page needs to know its connection's assigned
-- package so it can show/checkout it. Adding an output column to a RETURNS
-- TABLE function requires drop + recreate, not create-or-replace.

drop function if exists public.get_my_ero_connection(uuid);

create function public.get_my_ero_connection(p_workspace_id uuid)
returns table(
  connection_id uuid,
  ero_workspace_id uuid,
  name text,
  relationship_type text,
  phone text,
  primary_contact_email text,
  website text,
  billing_responsibility text,
  shares_communications_identity boolean,
  allows_branding_override boolean,
  package_id uuid
)
language plpgsql
stable security definer
set search_path to 'public'
as $function$
begin
  if not public.is_workspace_member(p_workspace_id) then
    raise exception 'Only a member of this workspace can view its ERO connection';
  end if;

  return query
    select
      fc.id, fc.parent_workspace_id, pw.name, fc.relationship_type, pw.phone, pw.primary_contact_email::text, pw.website,
      fc.billing_responsibility, fc.shares_communications_identity, fc.allows_branding_override, fc.package_id
    from public.firm_connections fc
    join public.workspaces pw on pw.id = fc.parent_workspace_id
    where fc.child_workspace_id = p_workspace_id
      and fc.relationship_type in ('ero_ptin', 'service_bureau_ero', 'service_bureau_ptin')
      and fc.status = 'active'
    limit 1;
end;
$function$;
