-- The prior migration (revenue_share_on_connection_not_package) rebuilt
-- get_ero_connected_partners from a stale copy of its body that predated
-- manual firm connections support -- it dropped the fc.source column and
-- the coalesce(...,  fc.manual_*) fallbacks a manually-added firm relies
-- on for its display fields. Restores that logic (verified against the
-- function's actual current shape, not a specific migration file's
-- filename-implied order) and keeps this migration's own addition
-- (revenue_share_percent/scope) on top of it.

drop function if exists public.get_ero_connected_partners(uuid, text[]);

create function public.get_ero_connected_partners(p_workspace_id uuid, p_relationship_types text[] default array['ero_ptin'::text])
returns table(
  connection_id uuid, child_workspace_id uuid, name text, owner_name text, relationship_type text, status text,
  phone text, primary_contact_email text, website text, mailing_address text,
  billing_responsibility text, shares_communications_identity boolean, allows_branding_override boolean,
  default_reviewer_id uuid, restrict_ptin_staff_assignment boolean, allows_learning_hub_downline_share boolean, package_id uuid,
  bank_partner_id uuid, bank_partner_name text, software_partner_id uuid, software_partner_name text,
  partner_software_used text[], partner_tax_programs text[], notes text, created_at timestamptz, responded_at timestamptz,
  efin_last4 text, ptin_last4 text, onboarding_stage text, preparer_credential text,
  filed_under_connection_id uuid, filed_under_name text, downstream_ptin_count int, source text,
  revenue_share_percent numeric, revenue_share_scope text
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  if not public.is_workspace_admin(p_workspace_id) then
    raise exception 'Only a workspace admin can view connected partners';
  end if;

  return query
    select
      fc.id, fc.child_workspace_id,
      coalesce(cw.name, fc.manual_name, 'Pending invite'), coalesce(cw.owner_name, fc.manual_owner_name),
      fc.relationship_type, fc.status,
      coalesce(cw.phone, fc.manual_phone), coalesce(cw.primary_contact_email::text, fc.manual_email),
      coalesce(cw.website, fc.manual_website), coalesce(cw.mailing_address, fc.manual_address),
      fc.billing_responsibility, fc.shares_communications_identity, fc.allows_branding_override,
      fc.default_reviewer_id, fc.restrict_ptin_staff_assignment, fc.allows_learning_hub_downline_share, fc.package_id,
      fc.bank_partner_id, bp.name, fc.software_partner_id, sp.name,
      fc.partner_software_used, fc.partner_tax_programs, fc.notes, fc.created_at, fc.responded_at,
      ftp.efin_last4, ftp.ptin_last4, fc.onboarding_stage, fc.preparer_credential,
      fc.filed_under_connection_id, fuw.name,
      (select count(*)::int from public.firm_connections dc where dc.parent_workspace_id = fc.child_workspace_id and dc.relationship_type = 'ero_ptin'),
      fc.source,
      fc.revenue_share_percent, fc.revenue_share_scope
    from public.firm_connections fc
    left join public.workspaces cw on cw.id = fc.child_workspace_id
    left join public.bank_partners bp on bp.id = fc.bank_partner_id
    left join public.software_partners sp on sp.id = fc.software_partner_id
    left join public.firm_tax_profile ftp on ftp.workspace_id = fc.child_workspace_id
    left join public.firm_connections fu on fu.id = fc.filed_under_connection_id
    left join public.workspaces fuw on fuw.id = fu.child_workspace_id
    where fc.parent_workspace_id = p_workspace_id
      and fc.relationship_type = any(p_relationship_types)
    order by (fc.status = 'active') desc, coalesce(cw.name, fc.manual_name) nulls last;
end;
$$;

revoke all on function public.get_ero_connected_partners(uuid, text[]) from public;
grant execute on function public.get_ero_connected_partners(uuid, text[]) to authenticated, service_role;
