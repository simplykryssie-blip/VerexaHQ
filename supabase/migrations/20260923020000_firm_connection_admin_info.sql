-- Per explicit product direction: the parent (ERO/SB) needs its own record
-- of each connected firm -- software packages used, tax programs, general
-- notes -- that it controls, independent of anything the child firm enters
-- about itself. These are parent-only fields: firm_connections' existing
-- update policy (is_workspace_admin(parent_workspace_id)) already restricts
-- writes to the parent, and the child-facing get_my_ero_connection RPC
-- never returns them (same discipline already applied to the pre-existing
-- `notes` column, which sat unused until now).
alter table public.firm_connections add column if not exists partner_software_used text[] not null default '{}';
alter table public.firm_connections add column if not exists partner_tax_programs text[] not null default '{}';

-- Also surfaces the connected firm's own self-declared owner_name -- safe
-- to share (unlike PTIN/EFIN/CAF/EIN, which stay firm-only per the
-- disclosure on Settings > ERO Profile) and already sitting unused on
-- workspaces since the ERO Profile fields shipped.
drop function if exists public.get_ero_connected_partners(uuid, text[]);

create function public.get_ero_connected_partners(p_workspace_id uuid, p_relationship_types text[] default array['ero_ptin'::text])
returns table(
  connection_id uuid, child_workspace_id uuid, name text, owner_name text, relationship_type text, status text,
  phone text, primary_contact_email text, website text, mailing_address text,
  billing_responsibility text, shares_communications_identity boolean, allows_branding_override boolean,
  default_reviewer_id uuid, restrict_ptin_staff_assignment boolean, allows_learning_hub_downline_share boolean,
  package_id uuid, bank_partner_id uuid, bank_partner_name text, software_partner_id uuid, software_partner_name text,
  partner_software_used text[], partner_tax_programs text[], notes text,
  created_at timestamp with time zone, responded_at timestamp with time zone
)
language plpgsql
stable security definer
set search_path to 'public'
as $function$
begin
  if not public.is_workspace_admin(p_workspace_id) then
    raise exception 'Only a workspace admin can view connected partners';
  end if;

  return query
    select
      fc.id, fc.child_workspace_id, coalesce(cw.name, 'Pending invite'), cw.owner_name, fc.relationship_type, fc.status,
      cw.phone, cw.primary_contact_email::text, cw.website, cw.mailing_address,
      fc.billing_responsibility, fc.shares_communications_identity, fc.allows_branding_override,
      fc.default_reviewer_id, fc.restrict_ptin_staff_assignment, fc.allows_learning_hub_downline_share, fc.package_id,
      fc.bank_partner_id, bp.name, fc.software_partner_id, sp.name,
      fc.partner_software_used, fc.partner_tax_programs, fc.notes, fc.created_at, fc.responded_at
    from public.firm_connections fc
    left join public.workspaces cw on cw.id = fc.child_workspace_id
    left join public.bank_partners bp on bp.id = fc.bank_partner_id
    left join public.software_partners sp on sp.id = fc.software_partner_id
    where fc.parent_workspace_id = p_workspace_id
      and fc.relationship_type = any(p_relationship_types)
    order by (fc.status = 'active') desc, cw.name nulls last;
end;
$function$;
