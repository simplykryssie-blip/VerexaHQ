-- A verified external-webhook package purchase creates a partner_prospect
-- and a partner_onboarding, but never a firm_connections row -- confirmed
-- by searching every function and migration in the repo for any insert
-- into firm_connections referencing a partner_prospect/partner_onboarding;
-- there is none. The Firms page (app/(app)/firms/page.tsx) only ever lists
-- firm_connections rows, so a purchaser can never appear there no matter
-- how far their onboarding progresses. Per explicit product confirmation:
-- "Firm is for anyone who purchases or who is invited and accepts the
-- connection" -- this is a real gap, not intentional design.
--
-- This migration wires record_verified_partner_purchase to find-or-create
-- the purchaser's Firm connection, reusing the exact shape
-- create_manual_firm_connection already uses (source='manual', no new
-- source value, no child_workspace_id/invite_token -- already a valid
-- combination per firm_connections_child_or_invite_check).

-- 1. Deterministic, per-package tier mapping -- confirmed explicitly, not
--    guessed. A package with relationship_type IS NULL never gets a
--    guessed connection; purchase/prospect/onboarding processing is
--    unaffected either way.
alter table public.firm_packages add column if not exists relationship_type text;

alter table public.firm_packages drop constraint if exists firm_packages_relationship_type_check;
alter table public.firm_packages add constraint firm_packages_relationship_type_check
  check (relationship_type is null or relationship_type = any (array['service_bureau_ero', 'ero_ptin', 'service_bureau_ptin']));

update public.firm_packages set relationship_type = 'service_bureau_ptin' where id = '42472c6a-0476-4573-b1bd-746d5a279d39'; -- The Starting Point, $199.99, prep fees only
update public.firm_packages set relationship_type = 'service_bureau_ero' where id = '742c1b52-3c4b-4fff-9383-c01b42fdac68'; -- The Business Lane, $399, all production
update public.firm_packages set relationship_type = 'service_bureau_ero' where id = '0d0a0e13-54fa-45e5-81f0-956de74dbf92'; -- The Growth Route, $999, all production
update public.firm_packages set relationship_type = 'service_bureau_ero' where id = '0a1208c2-af90-4333-9f4e-12b47e8a70c8'; -- The Executive Avenue, $1499, all production

-- 2. Links a purchase-created connection back to its prospect -- the
--    invite-based flow identifies a connection by child_workspace_id,
--    which a prospect (no VerexaHQ workspace of its own) never has. This
--    is also the idempotency key: one Firm connection per prospect per
--    owning workspace. A plain (non-partial) unique constraint is
--    correct and sufficient here -- Postgres already treats every NULL
--    partner_prospect_id as distinct from every other, so the existing
--    invite-based/manually-added rows (partner_prospect_id always null)
--    never conflict with each other. A named constraint (rather than a
--    bare unique index) is required so the function below can target it
--    with ON CONFLICT ON CONSTRAINT -- a plain ON CONFLICT (parent_workspace_id,
--    partner_prospect_id) column list is ambiguous inside this function,
--    since its own RETURNS TABLE(...) already names an OUT parameter
--    partner_prospect_id. Named firm_connections_parent_prospect_key
--    (not _uidx) to avoid colliding with an index of that name from an
--    earlier draft of this migration.
alter table public.firm_connections add column if not exists partner_prospect_id uuid references public.partner_prospects(id);

alter table public.firm_connections drop constraint if exists firm_connections_parent_prospect_key;
alter table public.firm_connections add constraint firm_connections_parent_prospect_key unique (parent_workspace_id, partner_prospect_id);

-- 3. record_verified_partner_purchase: resolve/update the purchaser's Firm
--    connection using the real purchaser/business data this specific
--    checkout gave (never fabricated), then link the purchase row to it
--    via connection_id. fire_firm_package_purchase_automations() and
--    _get_or_create_partner_onboarding() already read new.connection_id --
--    no changes needed there; onboarding linkage and connection-aware
--    automation steps (move_pipeline_stage, assign_user, etc.) pick this
--    up automatically once connection_id is non-null.
--
--    Idempotency: a duplicate webhook delivery of the SAME purchase hits
--    the existing (parent_workspace_id, external_payment_id) conflict
--    branch below and returns before creating anything new -- this
--    connection-upsert only ever runs again with byte-identical purchaser
--    data from the same retried delivery, which is a harmless no-op
--    update, never a duplicate row (enforced by the new unique index
--    above). A second, later, genuinely different purchase by the same
--    prospect reuses the same connection row rather than creating a
--    second one. Note: firm_package_purchases_active_per_connection (an
--    existing, pre-dating constraint) still enforces at most one
--    pending/active/past_due purchase per connection at a time -- a
--    second purchase attempted while the first is still active correctly
--    errors, same business rule the invite-based flow has always had.
-- CREATE OR REPLACE only replaces a function with the SAME parameter
-- list -- adding a new trailing parameter creates a second, overloaded
-- function instead, which made an RPC call omitting p_business_name
-- ambiguous between the two signatures. Drop the pre-existing 13-arg
-- signature explicitly so only the 14-arg version below remains.
drop function if exists public.record_verified_partner_purchase(uuid, uuid, text, text, text, numeric, text, text, text, text, text, text, timestamp with time zone);

create or replace function public.record_verified_partner_purchase(p_owning_workspace_id uuid, p_package_id uuid, p_purchaser_name text, p_purchaser_email text, p_purchaser_phone text, p_amount numeric, p_currency text, p_payment_provider text, p_payment_reference text, p_external_payment_id text, p_external_customer_id text DEFAULT NULL::text, p_external_checkout_session_id text DEFAULT NULL::text, p_purchased_at timestamp with time zone DEFAULT now(), p_business_name text DEFAULT NULL::text)
 returns TABLE(did_process boolean, purchase_id uuid, onboarding_id uuid, partner_prospect_id uuid)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_package record;
  v_prospect_id uuid;
  v_purchase_id uuid;
  v_onboarding_id uuid;
  v_name_parts text[];
  v_connection_id uuid;
begin
  select id, workspace_id, name, relationship_type into v_package from public.firm_packages where id = p_package_id;
  if v_package.id is null or v_package.workspace_id <> p_owning_workspace_id then
    raise exception 'package % does not belong to workspace %', p_package_id, p_owning_workspace_id;
  end if;

  v_name_parts := regexp_split_to_array(btrim(coalesce(p_purchaser_name, '')), '\s+');
  v_prospect_id := public.find_or_create_partner_prospect(
    p_owning_workspace_id,
    v_name_parts[1],
    nullif(array_to_string(v_name_parts[2:array_length(v_name_parts, 1)], ' '), ''),
    p_purchaser_email,
    p_purchaser_phone,
    'purchase',
    p_external_customer_id
  );

  if v_package.relationship_type is not null then
    insert into public.firm_connections (
      parent_workspace_id, relationship_type, status, source, package_id,
      partner_prospect_id, manual_name, manual_owner_name, manual_phone, manual_email,
      responded_at
    )
    values (
      p_owning_workspace_id, v_package.relationship_type, 'active', 'manual', p_package_id,
      v_prospect_id,
      coalesce(nullif(btrim(coalesce(p_business_name, '')), ''), nullif(btrim(coalesce(p_purchaser_name, '')), '')),
      nullif(btrim(coalesce(p_purchaser_name, '')), ''),
      nullif(btrim(coalesce(p_purchaser_phone, '')), ''),
      nullif(btrim(coalesce(p_purchaser_email, '')), ''),
      now()
    )
    on conflict on constraint firm_connections_parent_prospect_key
    do update set
      relationship_type = excluded.relationship_type,
      package_id = excluded.package_id,
      manual_name = coalesce(excluded.manual_name, public.firm_connections.manual_name),
      manual_owner_name = coalesce(excluded.manual_owner_name, public.firm_connections.manual_owner_name),
      manual_phone = coalesce(excluded.manual_phone, public.firm_connections.manual_phone),
      manual_email = coalesce(excluded.manual_email, public.firm_connections.manual_email),
      updated_at = now()
    returning id into v_connection_id;
  end if;

  -- firm_package_purchases_buyer_chk requires EXACTLY ONE of connection_id /
  -- partner_prospect_id -- never both, never neither. Once this purchase
  -- has a resolved Firm connection, it is -- by the schema's own existing
  -- design -- a connected-firm purchase, the same as the invite-based
  -- flow's, and is identified by connection_id, not partner_prospect_id.
  insert into public.firm_package_purchases (
    package_id, parent_workspace_id, partner_prospect_id, connection_id, status,
    amount, currency, source, payment_provider, payment_reference,
    external_customer_id, external_checkout_session_id, external_payment_id,
    purchaser_name, purchaser_email, purchaser_phone, purchased_at
  )
  values (
    p_package_id, p_owning_workspace_id,
    case when v_connection_id is not null then null else v_prospect_id end,
    v_connection_id, 'pending',
    p_amount, coalesce(nullif(p_currency, ''), 'usd'), 'external_webhook', p_payment_provider, p_payment_reference,
    p_external_customer_id, p_external_checkout_session_id, p_external_payment_id,
    p_purchaser_name, p_purchaser_email, p_purchaser_phone, p_purchased_at
  )
  on conflict (parent_workspace_id, external_payment_id) where external_payment_id is not null do nothing
  returning id into v_purchase_id;

  if v_purchase_id is null then
    select id into v_purchase_id from public.firm_package_purchases
    where parent_workspace_id = p_owning_workspace_id and external_payment_id = p_external_payment_id;
    select id into v_onboarding_id from public.partner_onboardings where firm_package_purchase_id = v_purchase_id;
    return query select false, v_purchase_id, v_onboarding_id, v_prospect_id;
    return;
  end if;

  update public.firm_package_purchases set status = 'active' where id = v_purchase_id;

  select id into v_onboarding_id from public.partner_onboardings where firm_package_purchase_id = v_purchase_id;

  return query select true, v_purchase_id, v_onboarding_id, v_prospect_id;
end;
$function$;

-- CREATE OR REPLACE for a NEW signature creates a new catalog object, which
-- does NOT inherit the original 13-arg function's grants -- it gets
-- Postgres's default (PUBLIC EXECUTE), silently reopening exactly the
-- access the original migration (20260917134844) explicitly revoked. Must
-- be re-applied here for the 14-arg signature, matching that original
-- intent: service_role only, since this function trusts its
-- p_owning_workspace_id/p_package_id arguments without any auth.uid()
-- check and is only ever meant to be called from a server-side webhook
-- handler using the service-role client.
drop function if exists public.record_verified_partner_purchase_legacy_13arg_unused(uuid, uuid, text, text, text, numeric, text, text, text, text, text, text, timestamp with time zone);

revoke all on function public.record_verified_partner_purchase(uuid, uuid, text, text, text, numeric, text, text, text, text, text, text, timestamp with time zone, text) from public, anon, authenticated;
grant execute on function public.record_verified_partner_purchase(uuid, uuid, text, text, text, numeric, text, text, text, text, text, text, timestamp with time zone, text) to service_role;
