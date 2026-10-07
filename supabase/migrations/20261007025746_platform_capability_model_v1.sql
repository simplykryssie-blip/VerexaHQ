-- Platform Capability Model V1
--
-- Introduces a platform-level, cumulative capability model on top of the
-- existing workspace_type tiers (independent_ptin -> ero_office/
-- multi_office_firm -> service_bureau) and the existing feature_flags /
-- workspace_feature_flags entitlement layer. Additive only: no existing
-- row's behavior changes.

-- Cumulative tier ranking. multi_office_firm groups with ero_office for
-- every existing tier gate in lib/workspaceCapabilities.ts
-- (isEroManagementTier) -- same rank here so a capability gated at the ERO
-- tier is available to it too.
create or replace function public.workspace_tier_rank(p_workspace_type text)
returns int
language sql
immutable
set search_path = public
as $$
  select case p_workspace_type
    when 'independent_ptin' then 1
    when 'ero_office' then 2
    when 'multi_office_firm' then 2
    when 'service_bureau' then 3
    else 1
  end;
$$;

-- Minimum workspace tier required to be eligible for a capability, on top
-- of the existing default_enabled / workspace_feature_flags override.
-- Nullable: existing flags with no tier requirement are unaffected.
alter table public.feature_flags
  add column if not exists min_workspace_tier text;

-- New platform-level capability rows for this phase's directive sections
-- (firm connections / partner management / provisioning / third-party
-- product distribution). Existing 18 flags are untouched.
insert into public.feature_flags (key, name, description, module, is_core, default_enabled, min_workspace_tier)
values
  ('firm_connections', 'Firm Connections', 'Connect to or manage connected PTIN firms and Firm Connection records', 'network', false, true, 'ero_office'),
  ('partner_management', 'Partner Management', 'Manage connected ERO partners, their onboarding, and partner-facing dashboards', 'network', false, true, 'service_bureau'),
  ('provisioning', 'Workspace Provisioning', 'Provision a new child workspace for a connected firm', 'network', false, true, 'service_bureau'),
  ('third_party_product_distribution', 'Third-Party Product Distribution', 'Sell third-party software, banking, and other reseller products to connected firms', 'commerce', false, true, 'service_bureau')
on conflict (key) do nothing;

-- Single entry point for "can this workspace use capability X" --
-- SECURITY DEFINER so callers don't need direct select on feature_flags/
-- workspace_feature_flags; fails closed on an unknown workspace or an
-- unknown capability key. Checks tier eligibility first, then the
-- workspace's own entitlement override, then the flag's platform default.
create or replace function public.workspace_has_capability(p_workspace_id uuid, p_capability_key text)
returns boolean
language plpgsql
stable security definer
set search_path = public
as $$
declare
  v_workspace_type text;
  v_flag record;
  v_override record;
begin
  select workspace_type into v_workspace_type from public.workspaces where id = p_workspace_id;
  if v_workspace_type is null then
    return false;
  end if;

  select id, default_enabled, min_workspace_tier into v_flag
  from public.feature_flags where key = p_capability_key;

  if v_flag.id is null then
    return false;
  end if;

  if v_flag.min_workspace_tier is not null
     and public.workspace_tier_rank(v_workspace_type) < public.workspace_tier_rank(v_flag.min_workspace_tier) then
    return false;
  end if;

  select is_enabled into v_override
  from public.workspace_feature_flags
  where workspace_id = p_workspace_id and feature_flag_id = v_flag.id;

  if v_override.is_enabled is not null then
    return v_override.is_enabled;
  end if;

  return coalesce(v_flag.default_enabled, false);
end;
$$;

grant execute on function public.workspace_tier_rank(text) to authenticated;
grant execute on function public.workspace_has_capability(uuid, text) to authenticated;

-- Generic Product foundation: extend firm_packages (already the most
-- generic product-ish table -- has relationship_type, purchase_purpose,
-- Stripe product/price linkage, agreement_template_id) with a type
-- discriminator and provider-agnostic/audience columns, rather than
-- creating a new, duplicate products table. Existing rows default to
-- 'package' (their current real meaning), so no existing Service Bureau
-- package behavior changes.
alter table public.firm_packages
  add column if not exists product_type text not null default 'package',
  add column if not exists provider_workspace_id uuid references public.workspaces(id),
  add column if not exists audience text;

alter table public.firm_packages
  add constraint firm_packages_product_type_check
  check (product_type = any (array['package', 'digital_product', 'service']));

comment on column public.firm_packages.product_type is 'package | digital_product | service -- see platform_products for the unified read-side Product model';
comment on column public.firm_packages.provider_workspace_id is 'Who actually provides this product -- the selling workspace itself (null) or a third party (set). Provider-agnostic per the platform Product model.';
comment on column public.firm_packages.audience is 'Free-text intended audience for this product (e.g. connected PTIN firms, end clients). Nullable -- not every product needs one.';

-- Products must remain ONE primary area, filterable by type rather than
-- split into separate top-level tabs/tables. platform_products is the
-- read-side union of firm_packages (package/digital_product) and services
-- (service) into one common shape.
--
-- security_invoker = true is required here: a plain view runs its query as
-- the view's OWNER for RLS purposes, and the connecting admin role in this
-- project has rolbypassrls = true. Without security_invoker, this view
-- would bypass RLS entirely and leak every workspace's firm_packages/
-- services rows to any authenticated user. With it, the view evaluates
-- firm_packages_select / services' own RLS as the querying role, same as
-- querying either table directly.
create or replace view public.platform_products
  with (security_invoker = true) as
select
  fp.id,
  fp.workspace_id,
  coalesce(fp.provider_workspace_id, fp.workspace_id) as provider_workspace_id,
  fp.product_type,
  fp.name,
  fp.description,
  fp.flat_price as price,
  fp.audience,
  fp.status,
  fp.created_at,
  fp.updated_at
from public.firm_packages fp
union all
select
  s.id,
  s.workspace_id,
  s.workspace_id as provider_workspace_id,
  'service' as product_type,
  s.name,
  s.description,
  s.default_price as price,
  null::text as audience,
  s.status,
  s.created_at,
  s.updated_at
from public.services s;

grant select on public.platform_products to authenticated;
