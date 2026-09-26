-- IRS Form 8821 reconciliation, part 1: real data model for Section 2
-- (up to two designees, each with their own address/phone/fax/CAF, plus the
-- new-address/new-telephone/new-fax/notices checkboxes) and the Section
-- 1/4/5 fields the prior implementation never captured at all (plan number,
-- "specific use not recorded on CAF", "retain prior authorizations",
-- "Intermediate Service Provider", "additional designees attached").
--
-- designee_user_id/designee_name/designee_caf_number only ever supported one
-- designee as three scalar columns -- replaced with a `designees` jsonb
-- array (max 2, matching the real form), same jsonb-array-of-structured-rows
-- pattern already used for `tax_matters`. Each element snapshots
-- {user_id, name, caf_number, address, phone, fax, new_address,
-- new_telephone, new_fax, receives_notices} at creation time -- same
-- "snapshot, don't live-join" reasoning the old designee_name column already
-- used. PTIN is deliberately NOT one of those fields: like SSN/ITIN/EIN, it's
-- stored encrypted on user_profiles and must not be duplicated in plaintext
-- here -- it's revealed transiently at document-generation time only (see
-- reveal_designee_ptin in the next migration).

alter table public.irs_authorizations
  add column plan_number text,
  add column specific_use_not_on_caf boolean not null default false,
  add column retain_prior_authorizations boolean not null default false,
  add column intermediate_service_provider boolean not null default false,
  add column additional_designees_attached boolean not null default false,
  add column designees jsonb not null default '[]'::jsonb;

alter table public.irs_authorizations
  add constraint irs_authorizations_designees_max_two
  check (jsonb_typeof(designees) = 'array' and jsonb_array_length(designees) <= 2);

-- Backfill existing rows from the columns being dropped below.
update public.irs_authorizations
set designees = jsonb_build_array(
  jsonb_build_object(
    'user_id', designee_user_id,
    'name', designee_name,
    'caf_number', designee_caf_number,
    'address', null,
    'phone', null,
    'fax', null,
    'new_address', false,
    'new_telephone', false,
    'new_fax', false,
    'receives_notices', false
  )
)
where designee_name is not null and jsonb_array_length(designees) = 0;

alter table public.irs_authorizations
  drop column designee_user_id,
  drop column designee_name,
  drop column designee_caf_number;

drop function if exists public.create_irs_authorization(uuid, uuid, uuid, text, uuid, jsonb);

-- Recreated to accept a designees array (1-2 entries, staff-entered address/
-- phone/fax/CAF per entry rather than a live profile join -- the real form's
-- own new-address/new-telephone/new-fax checkboxes exist precisely because a
-- designee's address of record can differ from what's filed here) instead of
-- a single p_designee_user_id.
create or replace function public.create_irs_authorization(
  p_workspace_id uuid,
  p_client_id uuid,
  p_engagement_id uuid,
  p_taxpayer_type text,
  p_designees jsonb,
  p_tax_matters jsonb,
  p_plan_number text default null,
  p_specific_use_not_on_caf boolean default false,
  p_retain_prior_authorizations boolean default false,
  p_intermediate_service_provider boolean default false,
  p_additional_designees_attached boolean default false
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_id uuid;
  v_designee jsonb;
begin
  if not public.has_permission(p_workspace_id, 'irs_authorizations.manage') then
    raise exception 'insufficient permissions to create an IRS authorization in this workspace';
  end if;

  if p_taxpayer_type not in ('individual', 'business') then
    raise exception 'invalid taxpayer type';
  end if;

  if not exists (select 1 from public.clients where id = p_client_id and workspace_id = p_workspace_id) then
    raise exception 'client not found in this workspace';
  end if;

  if p_engagement_id is not null and not exists (
    select 1 from public.engagements where id = p_engagement_id and workspace_id = p_workspace_id and client_id = p_client_id
  ) then
    raise exception 'engagement not found for this client';
  end if;

  if p_designees is null or jsonb_typeof(p_designees) <> 'array' or jsonb_array_length(p_designees) < 1 then
    raise exception 'at least one designee is required';
  end if;
  if jsonb_array_length(p_designees) > 2 then
    raise exception 'a maximum of two designees is supported -- use "additional designees attached" for more';
  end if;

  for v_designee in select * from jsonb_array_elements(p_designees) loop
    if coalesce(trim(v_designee->>'name'), '') = '' then
      raise exception 'each designee needs a name';
    end if;
    if v_designee->>'user_id' is not null and not exists (
      select 1 from public.workspace_users where workspace_id = p_workspace_id and user_id = (v_designee->>'user_id')::uuid and status = 'active'
    ) then
      raise exception 'designee is not an active member of this workspace';
    end if;
  end loop;

  insert into public.irs_authorizations (
    workspace_id, client_id, engagement_id, taxpayer_type,
    designees, tax_matters, plan_number, specific_use_not_on_caf,
    retain_prior_authorizations, intermediate_service_provider,
    additional_designees_attached, created_by
  ) values (
    p_workspace_id, p_client_id, p_engagement_id, p_taxpayer_type,
    p_designees, coalesce(p_tax_matters, '[]'::jsonb), p_plan_number, p_specific_use_not_on_caf,
    p_retain_prior_authorizations, p_intermediate_service_provider,
    p_additional_designees_attached, auth.uid()
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.create_irs_authorization(uuid, uuid, uuid, text, jsonb, jsonb, text, boolean, boolean, boolean, boolean) from public, anon;
grant execute on function public.create_irs_authorization(uuid, uuid, uuid, text, jsonb, jsonb, text, boolean, boolean, boolean, boolean) to authenticated;
