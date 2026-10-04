-- Lets an ERO/Service Bureau track a firm that doesn't use VerexaHQ at all --
-- today firm_connections only ever gets a workspace-less row transiently,
-- while an invite is pending redemption (see firm_connection_invites), and
-- the connected firm's name/phone/email/website/address are always pulled
-- from their own workspaces row via get_ero_connected_partners. A manual
-- firm has no workspace and never will, so it needs (a) permission for a
-- workspace-less row to be permanent, not just a pending invite, and (b) its
-- own copies of those fields since there's no workspace to join against.

alter table public.firm_connections
  add column source text not null default 'workspace_invite',
  add column manual_name text,
  add column manual_owner_name text,
  add column manual_phone text,
  add column manual_email text,
  add column manual_website text,
  add column manual_address text;

alter table public.firm_connections
  add constraint firm_connections_source_check check (source in ('workspace_invite', 'manual'));

alter table public.firm_connections
  add constraint firm_connections_manual_name_check check (source <> 'manual' or manual_name is not null);

alter table public.firm_connections drop constraint firm_connections_child_or_invite_check;
alter table public.firm_connections
  add constraint firm_connections_child_or_invite_check
    check (child_workspace_id is not null or (invite_token is not null and status = 'pending') or source = 'manual');

comment on column public.firm_connections.source is 'workspace_invite: connected firm is its own VerexaHQ workspace, redeemed an invite. manual: parent-entered record for a firm that doesn''t use VerexaHQ -- child_workspace_id stays null forever.';
comment on column public.firm_connections.manual_name is 'Firm/owner-entered fields for a manual (non-VerexaHQ) connection -- ignored once/if this ever became a real workspace connection.';

create or replace function public.create_manual_firm_connection(
  p_workspace_id uuid,
  p_relationship_type text,
  p_name text,
  p_owner_name text default null,
  p_phone text default null,
  p_email text default null,
  p_website text default null,
  p_address text default null,
  p_notes text default null
)
returns public.firm_connections
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_row public.firm_connections;
begin
  if not public.is_workspace_admin(p_workspace_id) then
    raise exception 'insufficient permissions to add a firm';
  end if;
  if p_relationship_type not in ('service_bureau_ero', 'ero_ptin', 'service_bureau_ptin') then
    raise exception 'invalid relationship_type';
  end if;
  if p_name is null or btrim(p_name) = '' then
    raise exception 'a firm name is required';
  end if;

  insert into public.firm_connections (
    parent_workspace_id, relationship_type, status, source,
    manual_name, manual_owner_name, manual_phone, manual_email, manual_website, manual_address, notes,
    responded_at
  )
  values (
    p_workspace_id, p_relationship_type, 'active', 'manual',
    btrim(p_name), p_owner_name, p_phone, p_email, p_website, p_address, p_notes,
    now()
  )
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.create_manual_firm_connection(uuid, text, text, text, text, text, text, text, text) from public;
grant execute on function public.create_manual_firm_connection(uuid, text, text, text, text, text, text, text, text) to authenticated;

-- Manual firms get an update path for their own fields too (the raw-table
-- update policy already lets the parent admin do this, but a dedicated RPC
-- keeps the client from having to know which columns are manual-only).
create or replace function public.update_manual_firm_connection(
  p_connection_id uuid,
  p_name text,
  p_owner_name text default null,
  p_phone text default null,
  p_email text default null,
  p_website text default null,
  p_address text default null
)
returns public.firm_connections
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_row public.firm_connections;
begin
  select * into v_row from public.firm_connections where id = p_connection_id;
  if v_row.id is null then
    raise exception 'connection not found';
  end if;
  if not public.is_workspace_admin(v_row.parent_workspace_id) then
    raise exception 'insufficient permissions';
  end if;
  if v_row.source <> 'manual' then
    raise exception 'this connection is not a manually-added firm';
  end if;
  if p_name is null or btrim(p_name) = '' then
    raise exception 'a firm name is required';
  end if;

  update public.firm_connections
  set manual_name = btrim(p_name),
      manual_owner_name = p_owner_name,
      manual_phone = p_phone,
      manual_email = p_email,
      manual_website = p_website,
      manual_address = p_address,
      updated_at = now()
  where id = p_connection_id
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.update_manual_firm_connection(uuid, text, text, text, text, text, text) from public;
grant execute on function public.update_manual_firm_connection(uuid, text, text, text, text, text, text) to authenticated;

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
  filed_under_connection_id uuid, filed_under_name text, downstream_ptin_count int, source text
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
      fc.source
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
