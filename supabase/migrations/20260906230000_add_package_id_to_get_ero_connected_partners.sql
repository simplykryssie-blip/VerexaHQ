-- The Firms detail page needs to know which package a connection is on.
-- Adding an output column to a RETURNS TABLE function requires drop +
-- recreate, not a plain create-or-replace.

drop function if exists public.get_ero_connected_partners(uuid, text[]);

create function public.get_ero_connected_partners(p_workspace_id uuid, p_relationship_types text[] default array['ero_ptin'::text])
returns table(
  connection_id uuid, child_workspace_id uuid, name text, relationship_type text, status text,
  phone text, primary_contact_email text, website text, mailing_address text,
  billing_responsibility text, shares_communications_identity boolean, allows_branding_override boolean,
  default_reviewer_id uuid, restrict_ptin_staff_assignment boolean, package_id uuid,
  notes text, created_at timestamp with time zone, responded_at timestamp with time zone
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
      cw.phone, cw.primary_contact_email::text, cw.website, cw.mailing_address,
      fc.billing_responsibility, fc.shares_communications_identity, fc.allows_branding_override,
      fc.default_reviewer_id, fc.restrict_ptin_staff_assignment, fc.package_id,
      fc.notes, fc.created_at, fc.responded_at
    from public.firm_connections fc
    left join public.workspaces cw on cw.id = fc.child_workspace_id
    where fc.parent_workspace_id = p_workspace_id
      and fc.relationship_type = any(p_relationship_types)
    order by (fc.status = 'active') desc, cw.name nulls last;
end;
$function$;
