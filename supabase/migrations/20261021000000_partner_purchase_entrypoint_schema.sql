-- Partner purchase entry point -- schema.
--
-- Problem: an external person (no Verexa account/workspace/subscription)
-- buys a package on an ERO/SB's own website (e.g. Doucet). Today the only
-- path into partner_onboardings requires firm_connection_id (NOT NULL),
-- and firm_connections means "Verexa workspace <-> Verexa workspace" --
-- even its existing "manual" (no child_workspace_id) shape is still a
-- *relationship* record, not a bare purchaser identity, and conflating the
-- two would surface raw purchasers as network relationships. So: a new,
-- generic partner_prospects table represents "someone who may become a
-- connection/workspace/user later, but isn't one yet" -- capable of being
-- linked forward without ever requiring those relationships up front.
--
-- firm_package_purchases and partner_onboardings already model exactly
-- "a package purchase" and "a partner in onboarding" -- both are extended
-- (nullable connection-side FK + new nullable prospect-side FK, exactly
-- one of the two required) rather than duplicated.

create table public.partner_prospects (
  id uuid primary key default gen_random_uuid(),
  owning_workspace_id uuid not null references public.workspaces(id) on delete cascade,
  first_name text,
  last_name text,
  email citext not null,
  phone text,
  tags text[] not null default '{}',
  assigned_staff_id uuid references auth.users(id) on delete set null,
  source text not null default 'purchase' check (source in ('purchase', 'manual', 'import')),
  external_customer_id text,
  linked_user_id uuid references auth.users(id) on delete set null,
  linked_workspace_id uuid references public.workspaces(id) on delete set null,
  linked_firm_connection_id uuid references public.firm_connections(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index partner_prospects_workspace_email_uidx on public.partner_prospects (owning_workspace_id, lower(email::text));

alter table public.partner_prospects enable row level security;

create policy partner_prospects_select on public.partner_prospects
  for select using (public.is_workspace_admin(owning_workspace_id) or public.is_platform_admin());

-- No direct write policies -- every mutation goes through
-- find_or_create_partner_prospect (service-role only) or staff-facing RPCs
-- added later, exactly like workspace_paid_seats.

create trigger set_updated_at before update on public.partner_prospects
  for each row execute function public.set_updated_at();

-- --------------------------------------------------------------------
-- firm_package_purchases: allow a prospect-based buyer alongside the
-- existing connection-based buyer. workspace_id (the buyer/child
-- workspace) and connection_id both become nullable; exactly one of
-- {connection_id, partner_prospect_id} must be set.
-- --------------------------------------------------------------------

alter table public.firm_package_purchases
  alter column connection_id drop not null,
  alter column workspace_id drop not null,
  add column partner_prospect_id uuid references public.partner_prospects(id),
  add column source text not null default 'in_app' check (source in ('in_app', 'external_webhook')),
  add column currency text not null default 'usd',
  add column payment_provider text,
  add column payment_reference text,
  add column external_customer_id text,
  add column external_checkout_session_id text,
  add column external_payment_id text,
  add column purchaser_name text,
  add column purchaser_email text,
  add column purchaser_phone text;

alter table public.firm_package_purchases
  add constraint firm_package_purchases_buyer_chk
  check ((connection_id is not null) <> (partner_prospect_id is not null));

create unique index firm_package_purchases_external_payment_uidx
  on public.firm_package_purchases (parent_workspace_id, external_payment_id)
  where external_payment_id is not null;

-- --------------------------------------------------------------------
-- partner_onboardings: same nullable-pair treatment.
-- --------------------------------------------------------------------

alter table public.partner_onboardings
  alter column firm_connection_id drop not null,
  add column partner_prospect_id uuid references public.partner_prospects(id);

alter table public.partner_onboardings
  add constraint partner_onboardings_partner_chk
  check ((firm_connection_id is not null) <> (partner_prospect_id is not null));

-- --------------------------------------------------------------------
-- automation_runs / tasks: thread the new entity kind through the same
-- way connection_id and firm_connection_id already are.
-- --------------------------------------------------------------------

alter table public.automation_runs
  add column partner_prospect_id uuid references public.partner_prospects(id);

alter table public.tasks
  add column partner_prospect_id uuid references public.partner_prospects(id) on delete cascade;

alter table public.tasks drop constraint tasks_engagement_or_client_chk;
alter table public.tasks add constraint tasks_engagement_or_client_chk
  check (engagement_id is not null or client_id is not null or firm_connection_id is not null or partner_prospect_id is not null);

-- --------------------------------------------------------------------
-- find_or_create_partner_prospect: the prospect-side equivalent of
-- find_or_create_public_lead. Not granted to anon/authenticated -- the
-- only caller is the trusted purchase webhook route (service role) and
-- record_verified_partner_purchase below.
-- --------------------------------------------------------------------

create or replace function public.find_or_create_partner_prospect(
  p_owning_workspace_id uuid,
  p_first_name text,
  p_last_name text,
  p_email text,
  p_phone text,
  p_source text default 'purchase',
  p_external_customer_id text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_id uuid;
  v_normalized_email citext;
begin
  v_normalized_email := nullif(lower(btrim(coalesce(p_email, ''))), '');
  if v_normalized_email is null then
    raise exception 'an email is required to identify a partner prospect';
  end if;

  select id into v_id
  from public.partner_prospects
  where owning_workspace_id = p_owning_workspace_id and lower(email::text) = v_normalized_email::text;

  if v_id is not null then
    update public.partner_prospects
    set first_name = coalesce(nullif(btrim(p_first_name), ''), first_name),
        last_name = coalesce(nullif(btrim(p_last_name), ''), last_name),
        phone = coalesce(nullif(btrim(p_phone), ''), phone),
        external_customer_id = coalesce(p_external_customer_id, external_customer_id)
    where id = v_id;
    return v_id;
  end if;

  insert into public.partner_prospects (
    owning_workspace_id, first_name, last_name, email, phone, source, external_customer_id
  ) values (
    p_owning_workspace_id, nullif(btrim(p_first_name), ''), nullif(btrim(p_last_name), ''),
    v_normalized_email, nullif(btrim(p_phone), ''), p_source, p_external_customer_id
  )
  on conflict (owning_workspace_id, (lower(email::text))) do update set updated_at = now()
  returning id into v_id;

  return v_id;
end;
$function$;

revoke all on function public.find_or_create_partner_prospect(uuid, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.find_or_create_partner_prospect(uuid, text, text, text, text, text, text) to service_role;

-- --------------------------------------------------------------------
-- _get_or_create_partner_onboarding: accept a prospect id as an
-- alternative to a connection id. Same idempotent shape as before
-- (firm_package_purchase_id first, then the partner identity, then a
-- race-safe re-select if the insert lost a concurrent duplicate delivery).
-- --------------------------------------------------------------------

create or replace function public._get_or_create_partner_onboarding(
  p_workspace_id uuid,
  p_firm_connection_id uuid,
  p_package_id uuid,
  p_firm_package_purchase_id uuid,
  p_partner_prospect_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_id uuid;
begin
  if p_firm_package_purchase_id is not null then
    select id into v_id from public.partner_onboardings where firm_package_purchase_id = p_firm_package_purchase_id;
    if v_id is not null then
      return v_id;
    end if;
  end if;

  if p_firm_connection_id is not null then
    select id into v_id from public.partner_onboardings
    where firm_connection_id = p_firm_connection_id and status not in ('rejected', 'withdrawn');
  else
    select id into v_id from public.partner_onboardings
    where partner_prospect_id = p_partner_prospect_id and status not in ('rejected', 'withdrawn');
  end if;
  if v_id is not null then
    return v_id;
  end if;

  insert into public.partner_onboardings (
    workspace_id, firm_connection_id, partner_prospect_id, package_id, firm_package_purchase_id,
    bank_software_setup_required
  )
  values (
    p_workspace_id, p_firm_connection_id, p_partner_prospect_id, p_package_id, p_firm_package_purchase_id,
    p_package_id is not null
  )
  on conflict (firm_package_purchase_id) do nothing
  returning id into v_id;

  if v_id is null then
    -- Lost a race with a concurrent duplicate delivery of the same purchase
    -- event -- the other insert already won, use its row instead of erroring.
    select id into v_id from public.partner_onboardings
    where (p_firm_package_purchase_id is not null and firm_package_purchase_id = p_firm_package_purchase_id)
       or (p_firm_connection_id is not null and firm_connection_id = p_firm_connection_id and status not in ('rejected', 'withdrawn'))
       or (p_firm_connection_id is null and partner_prospect_id = p_partner_prospect_id and status not in ('rejected', 'withdrawn'))
    order by created_at asc
    limit 1;
  end if;

  return v_id;
end;
$function$;

-- --------------------------------------------------------------------
-- Per-workspace inbound purchase-webhook configuration -- same
-- bring-your-own-secret shape as workspace_jotform_connections. RLS
-- enabled with no policies; every interaction goes through the RPCs below.
-- --------------------------------------------------------------------

create table public.workspace_partner_purchase_webhooks (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  endpoint_token uuid not null unique default gen_random_uuid(),
  signing_secret_encrypted bytea not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  rotated_at timestamptz
);

alter table public.workspace_partner_purchase_webhooks enable row level security;

create or replace function public.set_partner_purchase_webhook(p_workspace_id uuid)
returns table (endpoint_token uuid, signing_secret text)
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_secret text := encode(gen_random_bytes(32), 'hex');
  v_token uuid;
begin
  if not public.is_workspace_admin(p_workspace_id) then
    raise exception 'insufficient permissions to configure a purchase webhook for this workspace';
  end if;

  insert into public.workspace_partner_purchase_webhooks (workspace_id, signing_secret_encrypted, created_by)
  values (p_workspace_id, public.encrypt_firm_secret(v_secret), auth.uid())
  on conflict (workspace_id) do update
    set signing_secret_encrypted = excluded.signing_secret_encrypted,
        endpoint_token = gen_random_uuid(),
        created_by = excluded.created_by,
        rotated_at = now()
  returning workspace_partner_purchase_webhooks.endpoint_token into v_token;

  return query select v_token, v_secret;
end;
$function$;

revoke all on function public.set_partner_purchase_webhook(uuid) from public, anon;
grant execute on function public.set_partner_purchase_webhook(uuid) to authenticated;

create or replace function public.get_partner_purchase_webhook_status(p_workspace_id uuid)
returns table (configured boolean, endpoint_token uuid, rotated_at timestamptz)
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not public.is_workspace_admin(p_workspace_id) then
    raise exception 'insufficient permissions to view this workspace''s purchase webhook';
  end if;

  return query
  select true, w.endpoint_token, w.rotated_at
  from public.workspace_partner_purchase_webhooks w
  where w.workspace_id = p_workspace_id
  union all
  select false, null::uuid, null::timestamptz
  where not exists (select 1 from public.workspace_partner_purchase_webhooks where workspace_id = p_workspace_id)
  limit 1;
end;
$function$;

revoke all on function public.get_partner_purchase_webhook_status(uuid) from public, anon;
grant execute on function public.get_partner_purchase_webhook_status(uuid) to authenticated;

-- Server-side only (the webhook route, running as service_role): resolve a
-- routing token to its owning workspace and plaintext secret so the route
-- can verify the sender's HMAC signature. Never exposed to the browser.
create or replace function public._resolve_partner_purchase_webhook(p_endpoint_token uuid)
returns table (workspace_id uuid, signing_secret text)
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
begin
  return query
  select w.workspace_id, public.decrypt_firm_secret(w.signing_secret_encrypted)
  from public.workspace_partner_purchase_webhooks w
  where w.endpoint_token = p_endpoint_token;
end;
$function$;

revoke all on function public._resolve_partner_purchase_webhook(uuid) from public, anon, authenticated;
grant execute on function public._resolve_partner_purchase_webhook(uuid) to service_role;

-- --------------------------------------------------------------------
-- record_verified_partner_purchase: the single entry point the webhook
-- route calls once it has verified the request's signature. Everything
-- here runs as service_role (called from the API route, not by a
-- signed-in user), so there is no auth.uid()-based check -- trust was
-- already established by the signature verification + token->workspace
-- lookup that happened before this was called.
--
-- Idempotency: external_payment_id is required and unique per
-- parent_workspace_id (firm_package_purchases_external_payment_uidx). A
-- replayed event with the same id hits that unique index, ON CONFLICT DO
-- NOTHING silently no-ops the insert, and did_process comes back false --
-- the caller returns success without creating anything a second time.
-- --------------------------------------------------------------------

create or replace function public.record_verified_partner_purchase(
  p_owning_workspace_id uuid,
  p_package_id uuid,
  p_purchaser_name text,
  p_purchaser_email text,
  p_purchaser_phone text,
  p_amount numeric,
  p_currency text,
  p_payment_provider text,
  p_payment_reference text,
  p_external_payment_id text,
  p_external_customer_id text default null,
  p_external_checkout_session_id text default null,
  p_purchased_at timestamptz default now()
)
returns table (did_process boolean, purchase_id uuid, onboarding_id uuid, partner_prospect_id uuid)
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
begin
  select id, workspace_id, name into v_package from public.firm_packages where id = p_package_id;
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

  insert into public.firm_package_purchases (
    package_id, parent_workspace_id, partner_prospect_id, status,
    amount, currency, source, payment_provider, payment_reference,
    external_customer_id, external_checkout_session_id, external_payment_id,
    purchaser_name, purchaser_email, purchaser_phone, purchased_at
  )
  values (
    p_package_id, p_owning_workspace_id, v_prospect_id, 'pending',
    p_amount, coalesce(nullif(p_currency, ''), 'usd'), 'external_webhook', p_payment_provider, p_payment_reference,
    p_external_customer_id, p_external_checkout_session_id, p_external_payment_id,
    p_purchaser_name, p_purchaser_email, p_purchaser_phone, p_purchased_at
  )
  on conflict (parent_workspace_id, external_payment_id) where external_payment_id is not null do nothing
  returning id into v_purchase_id;

  if v_purchase_id is null then
    -- Replay of an already-processed event: return the existing rows,
    -- create nothing new, fire no automation.
    select id into v_purchase_id from public.firm_package_purchases
    where parent_workspace_id = p_owning_workspace_id and external_payment_id = p_external_payment_id;
    select id into v_onboarding_id from public.partner_onboardings where firm_package_purchase_id = v_purchase_id;
    return query select false, v_purchase_id, v_onboarding_id, v_prospect_id;
    return;
  end if;

  -- Flips pending -> active, which is what the existing
  -- firm_package_purchases_fire_automations trigger (AFTER UPDATE) fires
  -- on -- reusing it rather than adding a second, INSERT-based trigger.
  update public.firm_package_purchases set status = 'active' where id = v_purchase_id;

  select id into v_onboarding_id from public.partner_onboardings where firm_package_purchase_id = v_purchase_id;

  return query select true, v_purchase_id, v_onboarding_id, v_prospect_id;
end;
$function$;

revoke all on function public.record_verified_partner_purchase(uuid, uuid, text, text, text, numeric, text, text, text, text, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.record_verified_partner_purchase(uuid, uuid, text, text, text, numeric, text, text, text, text, text, text, timestamptz) to service_role;
