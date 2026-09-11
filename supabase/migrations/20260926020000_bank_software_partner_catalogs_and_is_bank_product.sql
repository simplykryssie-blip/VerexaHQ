-- Bank Partners: an ERO/SB's own bank/transmitter relationships, each with
-- a standard fee schedule -- assigned per PTIN so a return's fees prefill
-- from what's already true of that bank, instead of retyping the same
-- numbers on every single bank product transaction.
create table public.bank_partners (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  standard_bank_fee numeric,
  standard_transmission_fee numeric,
  standard_paperwork_fee numeric,
  standard_addon_fee numeric,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index bank_partners_workspace_id_idx on public.bank_partners(workspace_id);
alter table public.bank_partners enable row level security;
create policy bank_partners_select on public.bank_partners for select using (
  public.is_workspace_member(workspace_id)
  or exists (
    select 1 from public.firm_connections fc
    where fc.parent_workspace_id = bank_partners.workspace_id
      and fc.status = 'active'
      and public.is_workspace_member(fc.child_workspace_id)
  )
);
create policy bank_partners_write on public.bank_partners for insert with check (public.is_workspace_admin(workspace_id));
create policy bank_partners_update on public.bank_partners for update using (public.is_workspace_admin(workspace_id)) with check (public.is_workspace_admin(workspace_id));
create policy bank_partners_delete on public.bank_partners for delete using (public.is_workspace_admin(workspace_id));

-- Software Partners: same idea for tax-prep software -- a standard
-- per-return software/technology fee, assigned per PTIN.
create table public.software_partners (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  standard_fee numeric,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index software_partners_workspace_id_idx on public.software_partners(workspace_id);
alter table public.software_partners enable row level security;
create policy software_partners_select on public.software_partners for select using (
  public.is_workspace_member(workspace_id)
  or exists (
    select 1 from public.firm_connections fc
    where fc.parent_workspace_id = software_partners.workspace_id
      and fc.status = 'active'
      and public.is_workspace_member(fc.child_workspace_id)
  )
);
create policy software_partners_write on public.software_partners for insert with check (public.is_workspace_admin(workspace_id));
create policy software_partners_update on public.software_partners for update using (public.is_workspace_admin(workspace_id)) with check (public.is_workspace_admin(workspace_id));
create policy software_partners_delete on public.software_partners for delete using (public.is_workspace_admin(workspace_id));

alter table public.firm_connections
  add column bank_partner_id uuid references public.bank_partners(id) on delete set null,
  add column software_partner_id uuid references public.software_partners(id) on delete set null;

-- A return's own bank-product/software fee, once assigned to a PTIN,
-- prefills bank_product_transactions -- still editable per return, the
-- schedule is a starting point, not a lock.
alter table public.bank_product_transactions
  add column software_fee numeric;

-- Marks a return as bank-product-funded as its own first-class fact on the
-- engagement, rather than something only inferable from whether a
-- bank_product_transactions row happens to exist -- lets the client/
-- engagement views and future filters/dashboards know without a join.
alter table public.engagements
  add column is_bank_product boolean not null default false;

drop function if exists public.get_ero_connected_partners(uuid, text[]);
create function public.get_ero_connected_partners(p_workspace_id uuid, p_relationship_types text[] default array['ero_ptin'::text])
returns table(
  connection_id uuid, child_workspace_id uuid, name text, relationship_type text, status text,
  phone text, primary_contact_email text, website text, mailing_address text,
  billing_responsibility text, shares_communications_identity boolean, allows_branding_override boolean,
  default_reviewer_id uuid, restrict_ptin_staff_assignment boolean, allows_learning_hub_downline_share boolean,
  package_id uuid, bank_partner_id uuid, bank_partner_name text, software_partner_id uuid, software_partner_name text,
  notes text, created_at timestamptz, responded_at timestamptz
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
      fc.id, fc.child_workspace_id, coalesce(cw.name, 'Pending invite'), fc.relationship_type, fc.status,
      cw.phone, cw.primary_contact_email::text, cw.website, cw.mailing_address,
      fc.billing_responsibility, fc.shares_communications_identity, fc.allows_branding_override,
      fc.default_reviewer_id, fc.restrict_ptin_staff_assignment, fc.allows_learning_hub_downline_share, fc.package_id,
      fc.bank_partner_id, bp.name, fc.software_partner_id, sp.name,
      fc.notes, fc.created_at, fc.responded_at
    from public.firm_connections fc
    left join public.workspaces cw on cw.id = fc.child_workspace_id
    left join public.bank_partners bp on bp.id = fc.bank_partner_id
    left join public.software_partners sp on sp.id = fc.software_partner_id
    where fc.parent_workspace_id = p_workspace_id
      and fc.relationship_type = any(p_relationship_types)
    order by (fc.status = 'active') desc, cw.name nulls last;
end;
$function$;
grant execute on function public.get_ero_connected_partners(uuid, text[]) to authenticated;

drop function if exists public.get_my_ero_connection(uuid);
create function public.get_my_ero_connection(p_workspace_id uuid)
returns table(
  connection_id uuid, ero_workspace_id uuid, name text, relationship_type text, phone text,
  primary_contact_email text, website text, billing_responsibility text, shares_communications_identity boolean,
  allows_branding_override boolean, package_id uuid, package_name text, revenue_share_percent numeric, revenue_share_scope text,
  bank_partner_id uuid, bank_partner_name text, software_partner_id uuid, software_partner_name text
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
      fc.billing_responsibility, fc.shares_communications_identity, fc.allows_branding_override,
      fc.package_id, fp.name, fp.revenue_share_percent, fp.revenue_share_scope,
      fc.bank_partner_id, bp.name, fc.software_partner_id, sp.name
    from public.firm_connections fc
    join public.workspaces pw on pw.id = fc.parent_workspace_id
    left join public.firm_packages fp on fp.id = fc.package_id
    left join public.bank_partners bp on bp.id = fc.bank_partner_id
    left join public.software_partners sp on sp.id = fc.software_partner_id
    where fc.child_workspace_id = p_workspace_id
      and fc.relationship_type in ('ero_ptin', 'service_bureau_ero', 'service_bureau_ptin')
      and fc.status = 'active'
    limit 1;
end;
$function$;
revoke all on function public.get_my_ero_connection(uuid) from public, anon;
grant execute on function public.get_my_ero_connection(uuid) to authenticated;
