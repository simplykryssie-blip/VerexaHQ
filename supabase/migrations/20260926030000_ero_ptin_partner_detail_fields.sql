-- One-stop partner info on the Firms detail page: an onboarding-progress
-- field (both ERO and PTIN connections), fields specific to an ERO partner
-- (how many of their own PTIN preparers connect through them), and fields
-- specific to a PTIN partner (their credential, and which of the parent's
-- connected EROs they file returns under). Surfaced alongside the connected
-- firm's own EFIN/PTIN last-4 (already collected in firm_tax_profile for
-- their own workspace, never previously shown to the parent).

alter table public.firm_connections
  add column onboarding_stage text check (onboarding_stage in ('invited', 'agreement_signed', 'software_provisioned', 'live')),
  add column preparer_credential text check (preparer_credential in ('ea', 'cpa', 'attorney', 'unenrolled', 'other')),
  add column filed_under_connection_id uuid references public.firm_connections(id) on delete set null;

comment on column public.firm_connections.onboarding_stage is 'Parent-only progress tracker for this partner relationship -- never shown to the connected firm.';
comment on column public.firm_connections.preparer_credential is 'Parent-only note on a PTIN partner''s credential type -- never shown to the connected firm.';
comment on column public.firm_connections.filed_under_connection_id is 'For a PTIN partner: which of the parent''s own connected ERO partners (another firm_connections row, same parent_workspace_id) they file returns under. Application-enforced, not a same-parent DB constraint.';

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
  filed_under_connection_id uuid, filed_under_name text, downstream_ptin_count int
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
      fc.id, fc.child_workspace_id, coalesce(cw.name, 'Pending invite'), cw.owner_name, fc.relationship_type, fc.status,
      cw.phone, cw.primary_contact_email::text, cw.website, cw.mailing_address,
      fc.billing_responsibility, fc.shares_communications_identity, fc.allows_branding_override,
      fc.default_reviewer_id, fc.restrict_ptin_staff_assignment, fc.allows_learning_hub_downline_share, fc.package_id,
      fc.bank_partner_id, bp.name, fc.software_partner_id, sp.name,
      fc.partner_software_used, fc.partner_tax_programs, fc.notes, fc.created_at, fc.responded_at,
      ftp.efin_last4, ftp.ptin_last4, fc.onboarding_stage, fc.preparer_credential,
      fc.filed_under_connection_id, fuw.name,
      (select count(*)::int from public.firm_connections dc where dc.parent_workspace_id = fc.child_workspace_id and dc.relationship_type = 'ero_ptin')
    from public.firm_connections fc
    left join public.workspaces cw on cw.id = fc.child_workspace_id
    left join public.bank_partners bp on bp.id = fc.bank_partner_id
    left join public.software_partners sp on sp.id = fc.software_partner_id
    left join public.firm_tax_profile ftp on ftp.workspace_id = fc.child_workspace_id
    left join public.firm_connections fu on fu.id = fc.filed_under_connection_id
    left join public.workspaces fuw on fuw.id = fu.child_workspace_id
    where fc.parent_workspace_id = p_workspace_id
      and fc.relationship_type = any(p_relationship_types)
    order by (fc.status = 'active') desc, cw.name nulls last;
end;
$$;

-- Recreating the function reset its grants to the schema default (PUBLIC +
-- anon could call it) -- lock it back down to authenticated only, matching
-- this schema's convention for SECURITY DEFINER functions (the internal
-- is_workspace_admin check made the old grant harmless, but not correct).
revoke all on function public.get_ero_connected_partners(uuid, text[]) from public;
grant execute on function public.get_ero_connected_partners(uuid, text[]) to authenticated, service_role;
