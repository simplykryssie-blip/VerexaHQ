-- MKB Financial Group: "Customized Tax Refund Calculator" ($150) digital
-- product intake.
--
-- ARCHITECTURE (see conversation audit for full evidence trail):
--   * "Contact Lead" = an existing public.clients row with
--     lifecycle_status = 'lead', created/deduped via the existing,
--     already-shipped public.find_or_create_public_lead() -- the same
--     primitive every other public lead-capture path in this app uses.
--     This migration never creates a Firm, a second Client-like table, an
--     Engagement, a Partner, or an ERO relationship.
--   * The public organizer/tax-organizer system (organizer_templates /
--     organizer_fields / organizer_responses) is intentionally NOT reused
--     for this form -- per explicit instruction. No other native,
--     non-organizer public-form framework exists in this codebase (the
--     site-page funnel builder's own former lead_form section type was
--     already retired in favor of an organizer embed). So this migration
--     adds the smallest new, reusable form framework: forms -> fields
--     (with conditional-display + file-upload config inline) ->
--     submissions (answers as jsonb keyed by field_key). Nothing here is
--     organizer-specific; a future digital product's intake form reuses
--     the same three tables.
--   * Purchases/workflow follow the shape already proven by the
--     partner-purchase-entrypoint subsystem (workspace_partner_purchase_webhooks
--     / record_verified_partner_purchase) -- a per-workspace, signed,
--     provider-agnostic webhook endpoint, an idempotent purchase row, and
--     a dedicated automation trigger event -- but targets public.clients
--     via find_or_create_public_lead, NOT public.partner_prospects, since
--     partner_prospects cannot enter a pipeline_run today (pipelines only
--     support entity_type in ('client','engagement')) and that table's
--     whole purpose is the partner relationship this feature must avoid.
--   * The 19-stage pipeline is a plain public.processes / process_stages
--     seed (same idempotent pattern as
--     20260921150850_mkb_quickbooks_pipeline_recovery.sql), entered via
--     the existing public.start_pipeline_run('client', ...), and advanced
--     with a small new helper that reuses the EXISTING
--     trg_advance_pipeline_on_stage_completed trigger (marking the current
--     stage 'Completed' auto-activates the next stage by display_order --
--     the same mechanism public.advance_pipeline_stage() uses for
--     staff-driven moves). This migration's own helper skips that
--     function's has_permission() check because these particular
--     transitions are driven by a signature-verified webhook and a
--     published-public-token intake submission, not by an authenticated
--     staff action.
--
-- Everything here is net-new schema/functions/seed data scoped to this one
-- feature; no existing table, function, or unrelated workspace is altered.

-- =====================================================================
-- 1. Digital product catalog (workspace-scoped; reusable for the future
--    $75 calculator without further schema changes)
-- =====================================================================
create table public.digital_products (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  price_cents integer not null check (price_cents >= 0),
  purchase_type text not null default 'service_only' check (purchase_type in ('service_only')),
  stripe_product_id text not null,
  stripe_price_id text not null,
  stripe_payment_link_id text not null,
  target_process_id uuid references public.processes(id) on delete set null,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index digital_products_stripe_payment_link_uidx
  on public.digital_products (stripe_payment_link_id);

alter table public.digital_products enable row level security;

create policy digital_products_select on public.digital_products
  for select using (public.is_workspace_admin(workspace_id) or public.is_platform_admin());

create trigger set_updated_at before update on public.digital_products
  for each row execute function public.set_updated_at();

comment on table public.digital_products is 'Catalog of one-time-purchase "digital products" (e.g. the $150 Customized Tax Refund Calculator) sold via an external Stripe Payment Link, mapped to the pipeline a purchase enters.';

-- =====================================================================
-- 2. Purchase record -- Part 3's internal fields, never client-editable
-- =====================================================================
create table public.digital_product_purchases (
  id uuid primary key default gen_random_uuid(),
  digital_product_id uuid not null references public.digital_products(id) on delete restrict,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  pipeline_run_id uuid references public.pipeline_runs(id) on delete set null,
  lead_source text not null default 'stripe_digital_product',
  product_name text not null,
  product_price_cents integer not null,
  purchase_type text not null default 'service_only',
  lead_type text not null default 'digital_product_customer',
  payment_status text not null default 'paid' check (payment_status in ('paid', 'refunded')),
  stripe_product_id text not null,
  stripe_price_id text not null,
  stripe_payment_link_id text not null,
  customization_status text not null default 'intake_pending' check (customization_status in ('intake_pending', 'in_progress', 'complete')),
  delivery_status text not null default 'not_started' check (delivery_status in ('not_started', 'delivered')),
  crm_integration_status text not null default 'pending' check (crm_integration_status in ('pending', 'connected', 'not_applicable')),
  source text not null default 'stripe',
  purchaser_name text,
  purchaser_email text,
  purchaser_phone text,
  amount numeric not null,
  currency text not null default 'usd',
  payment_provider text not null default 'stripe',
  payment_reference text,
  external_customer_id text,
  external_checkout_session_id text,
  external_payment_id text,
  purchased_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index digital_product_purchases_external_payment_uidx
  on public.digital_product_purchases (workspace_id, external_payment_id)
  where external_payment_id is not null;

create index digital_product_purchases_client_product_idx
  on public.digital_product_purchases (client_id, digital_product_id, purchased_at desc);

alter table public.digital_product_purchases enable row level security;

create policy digital_product_purchases_select on public.digital_product_purchases
  for select using (public.is_workspace_admin(workspace_id) or public.is_platform_admin());

create trigger set_updated_at before update on public.digital_product_purchases
  for each row execute function public.set_updated_at();

comment on table public.digital_product_purchases is 'One row per verified digital-product purchase. purchaser is linked to public.clients (lifecycle_status=lead) via client_id -- never a Firm/Engagement/Partner. All fields here are server-derived; never populated from a public form submission.';

-- =====================================================================
-- 3. Native public intake form framework (NOT organizer-based)
-- =====================================================================
create table public.digital_product_intake_forms (
  id uuid primary key default gen_random_uuid(),
  digital_product_id uuid not null references public.digital_products(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  public_token uuid not null default gen_random_uuid(),
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index digital_product_intake_forms_public_token_uidx
  on public.digital_product_intake_forms (public_token);

alter table public.digital_product_intake_forms enable row level security;

create policy digital_product_intake_forms_select on public.digital_product_intake_forms
  for select using (public.is_workspace_admin(workspace_id) or public.is_platform_admin());

create trigger set_updated_at before update on public.digital_product_intake_forms
  for each row execute function public.set_updated_at();

create table public.digital_product_intake_fields (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.digital_product_intake_forms(id) on delete cascade,
  section_name text not null,
  field_key text not null,
  label text not null,
  field_type text not null check (field_type in (
    'short_text', 'long_text', 'email', 'phone', 'url', 'dropdown', 'yes_no',
    'multi_select', 'color', 'file_upload', 'static_disclaimer', 'checkbox_acknowledgment'
  )),
  help_text text,
  placeholder text,
  default_value text,
  is_required boolean not null default false,
  display_order integer not null default 0,
  options jsonb,
  file_config jsonb,
  conditional_on_field_key text,
  conditional_on_values text[],
  static_content text,
  contact_lead_map text check (contact_lead_map in ('first_name', 'last_name', 'email', 'phone')),
  created_at timestamptz not null default now(),
  unique (form_id, field_key)
);

alter table public.digital_product_intake_fields enable row level security;

create policy digital_product_intake_fields_select on public.digital_product_intake_fields
  for select using (
    exists (
      select 1 from public.digital_product_intake_forms f
      where f.id = form_id and (public.is_workspace_admin(f.workspace_id) or public.is_platform_admin())
    )
  );

comment on column public.digital_product_intake_fields.conditional_on_values is 'Field is only shown/required when the answer to conditional_on_field_key is one of these values. Null/empty conditional_on_field_key means always shown.';
comment on column public.digital_product_intake_fields.contact_lead_map is 'When set, this field''s answer feeds find_or_create_public_lead() for the resulting Contact Lead. Never used for anything else -- there is no path from a submitted answer to workspace_id/client_id/internal status.';

create table public.digital_product_intake_submissions (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.digital_product_intake_forms(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  purchase_id uuid references public.digital_product_purchases(id) on delete set null,
  answers jsonb not null default '{}'::jsonb,
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.digital_product_intake_submissions enable row level security;

create policy digital_product_intake_submissions_select on public.digital_product_intake_submissions
  for select using (public.is_workspace_admin(workspace_id) or public.is_platform_admin());

-- =====================================================================
-- 4. Public RPCs for the intake form -- token-first, mirrors
--    capture_public_lead_from_contact_step's pattern exactly.
-- =====================================================================
create or replace function public.get_public_digital_product_intake_form(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_form record;
  v_fields jsonb;
begin
  select f.id, f.name, f.digital_product_id, w.name as workspace_name
  into v_form
  from public.digital_product_intake_forms f
  join public.workspaces w on w.id = f.workspace_id
  where f.public_token = p_token and f.status = 'published';

  if v_form.id is null then
    raise exception 'This intake form is no longer available';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'field_key', field_key,
    'section_name', section_name,
    'label', label,
    'field_type', field_type,
    'help_text', help_text,
    'placeholder', placeholder,
    'default_value', default_value,
    'is_required', is_required,
    'display_order', display_order,
    'options', options,
    'file_config', file_config,
    'conditional_on_field_key', conditional_on_field_key,
    'conditional_on_values', conditional_on_values,
    'static_content', static_content
  ) order by display_order), '[]'::jsonb)
  into v_fields
  from public.digital_product_intake_fields
  where form_id = v_form.id;

  return jsonb_build_object(
    'form_id', v_form.id,
    'name', v_form.name,
    'workspace_name', v_form.workspace_name,
    'fields', v_fields
  );
end;
$function$;

revoke all on function public.get_public_digital_product_intake_form(uuid) from public;
grant execute on function public.get_public_digital_product_intake_form(uuid) to anon, authenticated;

create or replace function public.submit_digital_product_intake(p_token uuid, p_answers jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_form record;
  v_field record;
  v_path_prefix text;
  v_answer jsonb;
  v_answer_text text;
  v_is_active boolean;
  v_condition_value text;
  v_first_name text;
  v_last_name text;
  v_email text;
  v_phone text;
  v_client_id uuid;
  v_submission_id uuid;
  v_purchase_id uuid;
  v_purchase_pipeline_run_id uuid;
  v_path text;
begin
  if p_answers is null or jsonb_typeof(p_answers) <> 'object' then
    raise exception 'answers must be a JSON object';
  end if;

  select f.id, f.workspace_id, f.digital_product_id
  into v_form
  from public.digital_product_intake_forms f
  where f.public_token = p_token and f.status = 'published';

  if v_form.id is null then
    raise exception 'This intake form is no longer available';
  end if;

  v_path_prefix := v_form.workspace_id::text || '/' || v_form.id::text || '/';

  for v_field in
    select * from public.digital_product_intake_fields where form_id = v_form.id order by display_order asc
  loop
    if v_field.field_type = 'static_disclaimer' then
      continue;
    end if;

    -- Determine whether this field is currently active (its conditional
    -- parent, if any, has a satisfying answer). Required/validation only
    -- applies to active fields.
    v_is_active := true;
    if v_field.conditional_on_field_key is not null then
      v_condition_value := p_answers ->> v_field.conditional_on_field_key;
      v_is_active := v_condition_value is not null and v_condition_value = any (v_field.conditional_on_values);
    end if;

    if v_is_active and v_field.is_required then
      if v_field.field_type = 'checkbox_acknowledgment' then
        if coalesce(p_answers ->> v_field.field_key, 'false') <> 'true' then
          raise exception 'Field "%" must be acknowledged', v_field.label;
        end if;
      elsif v_field.field_type = 'file_upload' then
        v_answer := p_answers -> v_field.field_key;
        if v_answer is null or jsonb_typeof(v_answer) <> 'array' or jsonb_array_length(v_answer) = 0 then
          raise exception 'Field "%" requires at least one file', v_field.label;
        end if;
      else
        v_answer_text := p_answers ->> v_field.field_key;
        if v_answer_text is null or btrim(v_answer_text) = '' then
          raise exception 'Field "%" is required', v_field.label;
        end if;
      end if;
    end if;

    -- File uploads: every claimed path must be one this workspace/form's
    -- upload endpoint could actually have produced. This is the only
    -- server-side trust boundary for uploads -- the browser never gets to
    -- claim an arbitrary storage path.
    if v_field.field_type = 'file_upload' and p_answers ? v_field.field_key then
      v_answer := p_answers -> v_field.field_key;
      if v_answer is not null and jsonb_typeof(v_answer) = 'array' then
        for v_path in select jsonb_array_elements_text(v_answer)
        loop
          if left(v_path, length(v_path_prefix)) <> v_path_prefix then
            raise exception 'Invalid file reference for field "%"', v_field.label;
          end if;
        end loop;
      end if;
    end if;

    if v_field.contact_lead_map is not null then
      v_answer_text := nullif(btrim(coalesce(p_answers ->> v_field.field_key, '')), '');
      if v_field.contact_lead_map = 'first_name' then v_first_name := v_answer_text;
      elsif v_field.contact_lead_map = 'last_name' then v_last_name := v_answer_text;
      elsif v_field.contact_lead_map = 'email' then v_email := v_answer_text;
      elsif v_field.contact_lead_map = 'phone' then v_phone := v_answer_text;
      end if;
    end if;
  end loop;

  if v_email is null then
    raise exception 'Email is required';
  end if;

  v_client_id := public.find_or_create_public_lead(v_form.workspace_id, v_first_name, v_last_name, v_email, v_phone);

  insert into public.digital_product_intake_submissions (form_id, workspace_id, client_id, answers)
  values (v_form.id, v_form.workspace_id, v_client_id, p_answers)
  returning id into v_submission_id;

  select id, pipeline_run_id into v_purchase_id, v_purchase_pipeline_run_id
  from public.digital_product_purchases
  where client_id = v_client_id
    and digital_product_id = v_form.digital_product_id
    and id not in (select purchase_id from public.digital_product_intake_submissions where purchase_id is not null and id <> v_submission_id)
  order by purchased_at desc
  limit 1;

  if v_purchase_id is not null then
    update public.digital_product_intake_submissions set purchase_id = v_purchase_id where id = v_submission_id;
    if v_purchase_pipeline_run_id is not null then
      perform public._advance_digital_product_pipeline_stage(v_purchase_pipeline_run_id, 'Intake Submitted');
    end if;
  end if;

  return jsonb_build_object('ok', true, 'submission_id', v_submission_id, 'client_id', v_client_id);
end;
$function$;

revoke all on function public.submit_digital_product_intake(uuid, jsonb) from public;
grant execute on function public.submit_digital_product_intake(uuid, jsonb) to anon, authenticated;

-- =====================================================================
-- 5. Pipeline stage advancement helper (system-driven, no staff session)
-- =====================================================================
create or replace function public._advance_digital_product_pipeline_stage(p_pipeline_run_id uuid, p_stage_name text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_current_stage_id uuid;
  v_current_order int;
  v_target_stage_id uuid;
  v_target_order int;
  v_loop_guard int := 0;
begin
  select current_stage_id into v_current_stage_id
  from public.pipeline_runs where id = p_pipeline_run_id and status = 'Active';

  if v_current_stage_id is null then
    return;
  end if;

  select id, display_order into v_target_stage_id, v_target_order
  from public.pipeline_stages where pipeline_run_id = p_pipeline_run_id and stage_name = p_stage_name;

  if v_target_stage_id is null then
    return;
  end if;

  select display_order into v_current_order from public.pipeline_stages where id = v_current_stage_id;

  if v_target_order <= v_current_order then
    return;
  end if;

  while v_current_stage_id is distinct from v_target_stage_id and v_loop_guard < 100 loop
    update public.pipeline_stages set status = 'Completed', completed_at = now() where id = v_current_stage_id;
    select current_stage_id into v_current_stage_id from public.pipeline_runs where id = p_pipeline_run_id;
    v_loop_guard := v_loop_guard + 1;
  end loop;
end;
$function$;

revoke all on function public._advance_digital_product_pipeline_stage(uuid, text) from public, anon, authenticated;
grant execute on function public._advance_digital_product_pipeline_stage(uuid, text) to service_role;

comment on function public._advance_digital_product_pipeline_stage(uuid, text) is 'System-driven pipeline stage advancement for digital-product purchases (webhook + public intake submission). Reuses the existing trg_advance_pipeline_on_stage_completed trigger by marking stages Completed in sequence -- same mechanism advance_pipeline_stage() uses for staff-driven moves, minus the has_permission() check, since there is no authenticated staff session in either calling context.';

-- =====================================================================
-- 6. Per-workspace signed purchase webhook (mirrors
--    workspace_partner_purchase_webhooks / _resolve_partner_purchase_webhook
--    exactly, reusing the existing encrypt_firm_secret/decrypt_firm_secret
--    pair rather than inventing a second encryption scheme).
-- =====================================================================
create table public.workspace_digital_product_purchase_webhooks (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  endpoint_token uuid not null unique default gen_random_uuid(),
  signing_secret_encrypted bytea not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  rotated_at timestamptz
);

alter table public.workspace_digital_product_purchase_webhooks enable row level security;

create or replace function public.set_digital_product_purchase_webhook(p_workspace_id uuid)
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

  insert into public.workspace_digital_product_purchase_webhooks (workspace_id, signing_secret_encrypted, created_by)
  values (p_workspace_id, public.encrypt_firm_secret(v_secret), auth.uid())
  on conflict (workspace_id) do update
    set signing_secret_encrypted = excluded.signing_secret_encrypted,
        endpoint_token = gen_random_uuid(),
        created_by = excluded.created_by,
        rotated_at = now()
  returning workspace_digital_product_purchase_webhooks.endpoint_token into v_token;

  return query select v_token, v_secret;
end;
$function$;

revoke all on function public.set_digital_product_purchase_webhook(uuid) from public, anon;
grant execute on function public.set_digital_product_purchase_webhook(uuid) to authenticated;

create or replace function public.get_digital_product_purchase_webhook_status(p_workspace_id uuid)
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
  from public.workspace_digital_product_purchase_webhooks w
  where w.workspace_id = p_workspace_id
  union all
  select false, null::uuid, null::timestamptz
  where not exists (select 1 from public.workspace_digital_product_purchase_webhooks where workspace_id = p_workspace_id)
  limit 1;
end;
$function$;

revoke all on function public.get_digital_product_purchase_webhook_status(uuid) from public, anon;
grant execute on function public.get_digital_product_purchase_webhook_status(uuid) to authenticated;

create or replace function public._resolve_digital_product_purchase_webhook(p_endpoint_token uuid)
returns table (workspace_id uuid, signing_secret text)
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
begin
  return query
  select w.workspace_id, public.decrypt_firm_secret(w.signing_secret_encrypted)
  from public.workspace_digital_product_purchase_webhooks w
  where w.endpoint_token = p_endpoint_token;
end;
$function$;

revoke all on function public._resolve_digital_product_purchase_webhook(uuid) from public, anon, authenticated;
grant execute on function public._resolve_digital_product_purchase_webhook(uuid) to service_role;

-- =====================================================================
-- 7. Verified purchase recorder -- the PAID entrypoint. Idempotent on
--    external_payment_id (same on-conflict-do-nothing shape as
--    record_verified_partner_purchase).
-- =====================================================================
create or replace function public.record_verified_digital_product_purchase(
  p_owning_workspace_id uuid,
  p_digital_product_id uuid,
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
returns table (did_process boolean, purchase_id uuid, client_id uuid, pipeline_run_id uuid)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_product record;
  v_name_parts text[];
  v_client_id uuid;
  v_purchase_id uuid;
  v_run_id uuid;
begin
  select id, workspace_id, name, price_cents, purchase_type, stripe_product_id, stripe_price_id, stripe_payment_link_id, target_process_id
  into v_product
  from public.digital_products
  where id = p_digital_product_id;

  if v_product.id is null or v_product.workspace_id <> p_owning_workspace_id then
    raise exception 'digital product % does not belong to workspace %', p_digital_product_id, p_owning_workspace_id;
  end if;

  if p_purchaser_email is null or btrim(p_purchaser_email) = '' then
    raise exception 'a purchaser email is required to identify the Contact Lead';
  end if;

  v_name_parts := regexp_split_to_array(btrim(coalesce(p_purchaser_name, '')), '\s+');
  v_client_id := public.find_or_create_public_lead(
    p_owning_workspace_id,
    nullif(v_name_parts[1], ''),
    nullif(array_to_string(v_name_parts[2:array_length(v_name_parts, 1)], ' '), ''),
    p_purchaser_email,
    p_purchaser_phone
  );

  insert into public.digital_product_purchases (
    digital_product_id, workspace_id, client_id,
    product_name, product_price_cents, purchase_type,
    stripe_product_id, stripe_price_id, stripe_payment_link_id,
    purchaser_name, purchaser_email, purchaser_phone,
    amount, currency, payment_provider, payment_reference,
    external_customer_id, external_checkout_session_id, external_payment_id,
    purchased_at
  )
  values (
    v_product.id, p_owning_workspace_id, v_client_id,
    v_product.name, v_product.price_cents, v_product.purchase_type,
    v_product.stripe_product_id, v_product.stripe_price_id, v_product.stripe_payment_link_id,
    p_purchaser_name, p_purchaser_email, p_purchaser_phone,
    p_amount, coalesce(nullif(p_currency, ''), 'usd'), p_payment_provider, p_payment_reference,
    p_external_customer_id, p_external_checkout_session_id, p_external_payment_id,
    p_purchased_at
  )
  on conflict (workspace_id, external_payment_id) where external_payment_id is not null do nothing
  returning id into v_purchase_id;

  if v_purchase_id is null then
    -- "pipeline_run_id" alone is ambiguous here: RETURNS TABLE's own
    -- pipeline_run_id output column is implicitly declared as a
    -- same-named PL/pgSQL variable in scope, colliding with
    -- digital_product_purchases.pipeline_run_id -- qualify explicitly.
    select digital_product_purchases.id, digital_product_purchases.pipeline_run_id
    into v_purchase_id, v_run_id
    from public.digital_product_purchases
    where workspace_id = p_owning_workspace_id and external_payment_id = p_external_payment_id;
    return query select false, v_purchase_id, v_client_id, v_run_id;
    return;
  end if;

  if v_product.target_process_id is not null then
    select pr.id into v_run_id
    from public.pipeline_runs pr
    where pr.entity_type = 'client' and pr.entity_id = v_client_id and pr.process_id = v_product.target_process_id and pr.status = 'Active';

    if v_run_id is null then
      v_run_id := public.start_pipeline_run('client', v_client_id, v_product.target_process_id);
    end if;

    perform public._advance_digital_product_pipeline_stage(v_run_id, 'Contact Lead Created/Updated');
    perform public._advance_digital_product_pipeline_stage(v_run_id, 'Intake Sent');

    update public.digital_product_purchases set pipeline_run_id = v_run_id where id = v_purchase_id;
  end if;

  perform public.fire_digital_product_purchase_automations(v_purchase_id, v_client_id);

  return query select true, v_purchase_id, v_client_id, v_run_id;
end;
$function$;

revoke all on function public.record_verified_digital_product_purchase(uuid, uuid, text, text, text, numeric, text, text, text, text, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.record_verified_digital_product_purchase(uuid, uuid, text, text, text, numeric, text, text, text, text, text, text, timestamptz) to service_role;

-- =====================================================================
-- 8. Automation trigger -- fires 'digital_product.purchased' so a
--    workspace admin can wire up the actual "email the client their
--    intake link" step via the existing automation engine, the same way
--    firm_package.purchased/partner_package.purchased already work. This
--    migration does not hardcode an email send.
-- =====================================================================
create or replace function public.fire_digital_product_purchase_automations(p_purchase_id uuid, p_client_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_purchase record;
  v_form record;
  v_context jsonb;
  v_automation record;
  v_run_id uuid;
begin
  select workspace_id, digital_product_id, product_name, purchaser_name, purchaser_email
  into v_purchase
  from public.digital_product_purchases where id = p_purchase_id;

  select public_token into v_form
  from public.digital_product_intake_forms
  where digital_product_id = v_purchase.digital_product_id and status = 'published'
  limit 1;

  v_context := jsonb_build_object(
    'purchase_id', p_purchase_id,
    'digital_product_id', v_purchase.digital_product_id,
    'product_name', v_purchase.product_name,
    'purchaser_name', v_purchase.purchaser_name,
    'purchaser_email', v_purchase.purchaser_email,
    'intake_form_token', v_form.public_token
  );

  for v_automation in
    select * from public.automations
    where workspace_id = v_purchase.workspace_id and is_enabled = true and status = 'published'
      and trigger_type = 'digital_product.purchased'
  loop
    if public.evaluate_automation_conditions(v_automation.conditions, v_context, v_purchase.workspace_id, p_client_id, null) then
      insert into public.automation_runs (workspace_id, automation_id, client_id, trigger_snapshot, status)
      values (v_purchase.workspace_id, v_automation.id, p_client_id, v_context, 'running')
      returning id into v_run_id;
      perform public.start_next_automation_step(v_run_id);
    end if;
  end loop;
end;
$function$;

revoke all on function public.fire_digital_product_purchase_automations(uuid, uuid) from public, anon, authenticated;
grant execute on function public.fire_digital_product_purchase_automations(uuid, uuid) to service_role;

-- =====================================================================
-- 9. Private storage bucket for public intake uploads (logo, brand
--    guidelines, reference materials). Uploads only ever happen
--    server-side via a service-role route (there is no authenticated
--    session to gate an insert policy against on a public purchase
--    form) -- same rationale as the existing signatures bucket. Only
--    staff read access is granted via RLS, keyed off the workspace_id
--    that is always the first path segment.
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'digital-product-intake',
  'digital-product-intake',
  false,
  10485760,
  array[
    'image/png', 'image/jpeg', 'image/svg+xml',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do nothing;

create policy digital_product_intake_storage_select on storage.objects for select
using (bucket_id = 'digital-product-intake' and public.has_permission(((storage.foldername(name))[1])::uuid, 'documents.view'));

-- =====================================================================
-- 10. Seed: MKB "Customized Tax Refund Calculator" pipeline, product,
--     intake form, and its 47 fields. Deterministic ids + upserts so
--     this migration is safely re-runnable, matching
--     20260921150850_mkb_quickbooks_pipeline_recovery.sql's pattern.
-- =====================================================================
insert into public.processes (id, workspace_id, name, slug, status, is_lead_funnel)
values ('c1000000-0000-0000-0000-000000000001', '2896bf43-95db-420f-9bb5-8854f537bbd1',
        'Customized Tax Refund Calculator', 'customized-tax-refund-calculator', 'published', true)
on conflict (id) do update set name = excluded.name, is_lead_funnel = excluded.is_lead_funnel, status = excluded.status;

insert into public.process_stages (id, process_id, name, display_order) values
  ('c2000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'Paid', 0),
  ('c2000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000001', 'Contact Lead Created/Updated', 1),
  ('c2000000-0000-0000-0000-000000000003', 'c1000000-0000-0000-0000-000000000001', 'Intake Sent', 2),
  ('c2000000-0000-0000-0000-000000000004', 'c1000000-0000-0000-0000-000000000001', 'Intake Submitted', 3),
  ('c2000000-0000-0000-0000-000000000005', 'c1000000-0000-0000-0000-000000000001', 'Intake Review', 4),
  ('c2000000-0000-0000-0000-000000000006', 'c1000000-0000-0000-0000-000000000001', 'Needs Information', 5),
  ('c2000000-0000-0000-0000-000000000007', 'c1000000-0000-0000-0000-000000000001', 'Email Request', 6),
  ('c2000000-0000-0000-0000-000000000008', 'c1000000-0000-0000-0000-000000000001', 'Waiting for Client', 7),
  ('c2000000-0000-0000-0000-000000000009', 'c1000000-0000-0000-0000-000000000001', 'Resubmitted', 8),
  ('c2000000-0000-0000-0000-00000000000a', 'c1000000-0000-0000-0000-000000000001', 'Approved', 9),
  ('c2000000-0000-0000-0000-00000000000b', 'c1000000-0000-0000-0000-000000000001', 'Customization In Progress', 10),
  ('c2000000-0000-0000-0000-00000000000c', 'c1000000-0000-0000-0000-000000000001', 'Customization Complete', 11),
  ('c2000000-0000-0000-0000-00000000000d', 'c1000000-0000-0000-0000-000000000001', 'Internal QA', 12),
  ('c2000000-0000-0000-0000-00000000000e', 'c1000000-0000-0000-0000-000000000001', 'Corrections Needed', 13),
  ('c2000000-0000-0000-0000-00000000000f', 'c1000000-0000-0000-0000-000000000001', 'Ready for Delivery', 14),
  ('c2000000-0000-0000-0000-000000000010', 'c1000000-0000-0000-0000-000000000001', 'Delivered', 15),
  ('c2000000-0000-0000-0000-000000000011', 'c1000000-0000-0000-0000-000000000001', 'Delivery Confirmation', 16),
  ('c2000000-0000-0000-0000-000000000012', 'c1000000-0000-0000-0000-000000000001', 'Follow-Up', 17),
  ('c2000000-0000-0000-0000-000000000013', 'c1000000-0000-0000-0000-000000000001', 'Completed', 18)
on conflict (id) do update set name = excluded.name, display_order = excluded.display_order;

insert into public.digital_products (
  id, workspace_id, name, price_cents, purchase_type,
  stripe_product_id, stripe_price_id, stripe_payment_link_id, target_process_id
) values (
  'c3000000-0000-0000-0000-000000000001', '2896bf43-95db-420f-9bb5-8854f537bbd1',
  'Customized Tax Refund Calculator', 15000, 'service_only',
  'prod_VMBCP0gCslkAgM', 'price_1ULSqePos8bgFzRfhZk83LOE', 'plink_1ULSvNPos8bgFzRfuY0N8cFa',
  'c1000000-0000-0000-0000-000000000001'
)
on conflict (id) do update set
  name = excluded.name, price_cents = excluded.price_cents, purchase_type = excluded.purchase_type,
  stripe_product_id = excluded.stripe_product_id, stripe_price_id = excluded.stripe_price_id,
  stripe_payment_link_id = excluded.stripe_payment_link_id, target_process_id = excluded.target_process_id;

insert into public.digital_product_intake_forms (id, digital_product_id, workspace_id, name, status)
values (
  'c4000000-0000-0000-0000-000000000001', 'c3000000-0000-0000-0000-000000000001',
  '2896bf43-95db-420f-9bb5-8854f537bbd1', 'Customized Tax Refund Calculator — Client Intake', 'published'
)
on conflict (id) do update set name = excluded.name, status = excluded.status;

insert into public.digital_product_intake_fields (
  form_id, section_name, field_key, label, field_type, help_text, placeholder, default_value,
  is_required, display_order, options, file_config, conditional_on_field_key, conditional_on_values,
  static_content, contact_lead_map
) values
-- Section 1 — Contact Information
('c4000000-0000-0000-0000-000000000001', 'Contact Information', 'first_name', 'First Name', 'short_text', null, null, null, true, 1, null, null, null, null, null, 'first_name'),
('c4000000-0000-0000-0000-000000000001', 'Contact Information', 'last_name', 'Last Name', 'short_text', null, null, null, true, 2, null, null, null, null, null, 'last_name'),
('c4000000-0000-0000-0000-000000000001', 'Contact Information', 'email', 'Email Address', 'email', null, null, null, true, 3, null, null, null, null, null, 'email'),
('c4000000-0000-0000-0000-000000000001', 'Contact Information', 'phone', 'Phone Number', 'phone', null, null, null, true, 4, null, null, null, null, null, 'phone'),
('c4000000-0000-0000-0000-000000000001', 'Contact Information', 'business_name', 'Business/Company Name', 'short_text', null, null, null, true, 5, null, null, null, null, null, null),
('c4000000-0000-0000-0000-000000000001', 'Contact Information', 'website', 'Website', 'url', null, null, null, false, 6, null, null, null, null, null, null),
('c4000000-0000-0000-0000-000000000001', 'Contact Information', 'business_type', 'Business Type', 'dropdown', null, null, null, true, 7,
  '["Tax Preparation Firm","Accounting/Bookkeeping Firm","CPA Firm","Tax Professional","Financial Services","Other"]'::jsonb, null, null, null, null, null),
('c4000000-0000-0000-0000-000000000001', 'Contact Information', 'other_business_type', 'Other Business Type', 'short_text', null, null, null, false, 8, null, null, 'business_type', array['Other'], null, null),
-- Section 2 — Your Brand
('c4000000-0000-0000-0000-000000000001', 'Your Brand', 'logo_upload', 'Upload Your Logo', 'file_upload',
  'Upload your primary business logo. A transparent PNG or SVG is preferred.', null, null, true, 9, null,
  '{"accept":["image/png","image/jpeg","image/svg+xml"],"multiple":false,"max_files":1,"max_size_bytes":5242880}'::jsonb, null, null, null, null),
('c4000000-0000-0000-0000-000000000001', 'Your Brand', 'has_brand_guidelines', 'Do You Have Brand Guidelines?', 'yes_no', null, null, null, true, 10, null, null, null, null, null, null),
('c4000000-0000-0000-0000-000000000001', 'Your Brand', 'brand_guidelines_upload', 'Upload Brand Guidelines', 'file_upload',
  'Upload your brand guide if you have one. This may include approved colors, fonts, logos, and other visual standards.', null, null, true, 11, null,
  '{"accept":["application/pdf","image/png","image/jpeg","image/svg+xml","application/vnd.openxmlformats-officedocument.wordprocessingml.document"],"multiple":true,"max_files":10,"max_size_bytes":10485760}'::jsonb,
  'has_brand_guidelines', array['Yes'], null, null),
('c4000000-0000-0000-0000-000000000001', 'Your Brand', 'primary_brand_color', 'Primary Brand Color', 'color', null, '#RRGGBB', null, true, 12, null, null, null, null, null, null),
('c4000000-0000-0000-0000-000000000001', 'Your Brand', 'secondary_brand_color', 'Secondary Brand Color', 'color', null, '#RRGGBB', null, false, 13, null, null, null, null, null, null),
('c4000000-0000-0000-0000-000000000001', 'Your Brand', 'accent_color', 'Accent Color', 'color', null, '#RRGGBB', null, false, 14, null, null, null, null, null, null),
('c4000000-0000-0000-0000-000000000001', 'Your Brand', 'brand_font', 'Brand Font', 'short_text',
  'If you have a preferred font, enter the font name. Otherwise, a compatible professional font will be selected.', null, null, false, 15, null, null, null, null, null, null),
-- Section 3 — Calculator Branding
('c4000000-0000-0000-0000-000000000001', 'Calculator Branding', 'calculator_display_name', 'What Name Should Appear on the Calculator?', 'short_text', null, 'ABC Tax & Accounting', null, true, 16, null, null, null, null, null, null),
('c4000000-0000-0000-0000-000000000001', 'Calculator Branding', 'calculator_title', 'What Should the Calculator Be Called?', 'short_text', null, null, 'Tax Refund Calculator', true, 17, null, null, null, null, null, null),
('c4000000-0000-0000-0000-000000000001', 'Calculator Branding', 'calculator_business_description', 'What Should the Calculator Say About Your Business?', 'long_text', null, 'Helping individuals and small businesses make smarter tax decisions.', null, false, 18, null, null, null, null, null, null),
('c4000000-0000-0000-0000-000000000001', 'Calculator Branding', 'calculator_phone', 'Business Phone Number Displayed on Calculator', 'phone', null, null, null, true, 19, null, null, null, null, null, null),
('c4000000-0000-0000-0000-000000000001', 'Calculator Branding', 'calculator_email', 'Business Email Displayed on Calculator', 'email', null, null, null, true, 20, null, null, null, null, null, null),
('c4000000-0000-0000-0000-000000000001', 'Calculator Branding', 'calculator_website', 'Business Website Displayed on Calculator', 'url', null, null, null, false, 21, null, null, null, null, null, null),
-- Section 4 — Client Lead Capture
('c4000000-0000-0000-0000-000000000001', 'Client Lead Capture', 'capture_user_info', 'Do You Want the Calculator to Capture Your User''s Information?', 'yes_no', null, null, 'Yes', true, 22, null, null, null, null, null, null),
('c4000000-0000-0000-0000-000000000001', 'Client Lead Capture', 'calculator_collected_fields', 'What Information Should Your Calculator Collect?', 'multi_select', null, null, null, true, 23,
  '["First Name","Last Name","Email","Phone Number","Business Name","Filing Status","Other"]'::jsonb, null, null, null, null, null),
('c4000000-0000-0000-0000-000000000001', 'Client Lead Capture', 'post_submit_action', 'What Should Happen After Someone Submits Their Calculator Results?', 'dropdown', null, null, null, true, 24,
  '["Show results immediately","Show results after submitting contact information","Redirect them to my website","Redirect them to my booking page","Redirect them to another URL"]'::jsonb, null, null, null, null, null),
('c4000000-0000-0000-0000-000000000001', 'Client Lead Capture', 'redirect_booking_url', 'Redirect/Booking URL', 'url', null, null, null, true, 25, null, null,
  'post_submit_action', array['Redirect them to my website','Redirect them to my booking page','Redirect them to another URL'], null, null),
-- Section 5 — Call to Action
('c4000000-0000-0000-0000-000000000001', 'Call to Action', 'cta_action', 'What Action Do You Want Users to Take?', 'dropdown', null, null, null, true, 26,
  '["Schedule a Consultation","Book a Tax Appointment","Request a Tax Quote","Contact My Office","Visit My Website","Get Started","Other"]'::jsonb, null, null, null, null, null),
('c4000000-0000-0000-0000-000000000001', 'Call to Action', 'custom_cta_text', 'Custom CTA Text', 'short_text', null, 'Schedule Your Tax Consultation', null, false, 27, null, null, null, null, null, null),
('c4000000-0000-0000-0000-000000000001', 'Call to Action', 'cta_booking_url', 'CTA/Booking URL', 'url', null, null, null, false, 28, null, null, null, null, null, null),
-- Section 6 — CRM / Lead Delivery
('c4000000-0000-0000-0000-000000000001', 'CRM / Lead Delivery', 'send_leads_to_crm', 'Do You Want Leads Sent to Your CRM?', 'yes_no', null, null, null, true, 29, null, null, null, null, null, null),
('c4000000-0000-0000-0000-000000000001', 'CRM / Lead Delivery', 'crm_provider', 'What CRM Do You Use?', 'dropdown', null, null, null, false, 30,
  '["Verexa","GoHighLevel","HubSpot","Salesforce","Zoho","Other","No CRM"]'::jsonb, null, 'send_leads_to_crm', array['Yes'], null, null),
('c4000000-0000-0000-0000-000000000001', 'CRM / Lead Delivery', 'crm_lead_endpoint_url', 'CRM Lead URL / Endpoint', 'url', null, null, null, false, 31, null, null, 'send_leads_to_crm', array['Yes'], null, null),
('c4000000-0000-0000-0000-000000000001', 'CRM / Lead Delivery', 'has_crm_api', 'Do You Have an API or Integration Available?', 'yes_no', null, null, null, false, 32, null, null, 'send_leads_to_crm', array['Yes'], null, null),
('c4000000-0000-0000-0000-000000000001', 'CRM / Lead Delivery', 'crm_integration_info', 'CRM/API Integration Information', 'long_text',
  'Provide any information needed to connect the calculator to your CRM. Do not enter passwords or secret API keys in this form.', null, null, false, 33, null, null, 'has_crm_api', array['Yes'], null, null),
-- Section 7 — Calculator Experience
('c4000000-0000-0000-0000-000000000001', 'Calculator Experience', 'tax_info_to_collect', 'Which Tax Information Should the Calculator Ask For?', 'multi_select', null, null, null, true, 34,
  '["Filing Status","Dependents","W-2 Income","Federal Withholding","State Withholding","Self-Employment Income","Self-Employment Expenses","Other Income","Child Tax Credit Information","Earned Income Information","Education Credits","Retirement Contributions","Other Deductions/Credits"]'::jsonb,
  null, null, null, null, null),
('c4000000-0000-0000-0000-000000000001', 'Calculator Experience', 'want_state_tax_estimation', 'Do You Want State Tax Estimation?', 'yes_no', null, null, null, true, 35, null, null, null, null, null, null),
('c4000000-0000-0000-0000-000000000001', 'Calculator Experience', 'states_for_estimation', 'Which State(s)?', 'short_text', null, 'e.g. CA, NY, TX', null, false, 36, null, null, 'want_state_tax_estimation', array['Yes'], null, null),
('c4000000-0000-0000-0000-000000000001', 'Calculator Experience', 'want_self_employment_estimates', 'Do You Want Self-Employment Estimates?', 'yes_no', null, null, null, true, 37, null, null, null, null, null, null),
('c4000000-0000-0000-0000-000000000001', 'Calculator Experience', 'want_business_1099_questions', 'Do You Want Business/1099 Income Questions?', 'yes_no', null, null, null, true, 38, null, null, null, null, null, null),
-- Section 8 — Disclaimer & Client-Facing Language
('c4000000-0000-0000-0000-000000000001', 'Disclaimer & Client-Facing Language', 'has_custom_disclaimer', 'Do You Have Specific Disclaimer Language You Want Used?', 'yes_no', null, null, null, true, 39, null, null, null, null, null, null),
('c4000000-0000-0000-0000-000000000001', 'Disclaimer & Client-Facing Language', 'custom_disclaimer_text', 'Custom Disclaimer Language', 'long_text', null, null, null, false, 40, null, null, 'has_custom_disclaimer', array['Yes'], null, null),
('c4000000-0000-0000-0000-000000000001', 'Disclaimer & Client-Facing Language', 'disclaimer_notice', 'Required Calculator Disclaimer', 'static_disclaimer', null, null, null, false, 41, null, null, null, null,
  'This calculator provides estimates for informational purposes only. Results are not a tax return, tax advice, or a guarantee of a refund or balance due. Actual tax results may vary based on individual circumstances, applicable tax laws, IRS guidance, forms, calculations, and information provided.', null),
('c4000000-0000-0000-0000-000000000001', 'Disclaimer & Client-Facing Language', 'estimate_acknowledgment', 'I understand that the calculator provides estimates only.', 'checkbox_acknowledgment', null, null, null, true, 42, null, null, null, null, null, null),
-- Section 9 — Customization Request
('c4000000-0000-0000-0000-000000000001', 'Customization Request', 'customization_requested', 'What Would You Like Customized?', 'multi_select', null, null, null, false, 43,
  '["Logo","Colors","Fonts","Calculator title","Business information","Lead-capture fields","CTA","Booking/website link","CRM/lead integration","Calculator questions","Disclaimer language","Other"]'::jsonb, null, null, null, null, null),
('c4000000-0000-0000-0000-000000000001', 'Customization Request', 'additional_customization_notes', 'Tell Us Anything Else You Want Customized', 'long_text', null, null, null, false, 44, null, null, null, null, null, null),
('c4000000-0000-0000-0000-000000000001', 'Customization Request', 'additional_reference_uploads', 'Upload Additional Reference Materials', 'file_upload', null, null, null, false, 45, null,
  '{"accept":["application/pdf","image/png","image/jpeg","image/svg+xml","application/vnd.openxmlformats-officedocument.wordprocessingml.document"],"multiple":true,"max_files":10,"max_size_bytes":10485760}'::jsonb, null, null, null, null),
-- Section 10 — Final Review
('c4000000-0000-0000-0000-000000000001', 'Final Review', 'info_confirmed_correct', 'Is All Information Provided Correct?', 'yes_no', null, null, null, true, 46, null, null, null, null, null, null),
('c4000000-0000-0000-0000-000000000001', 'Final Review', 'final_notes', 'Final Notes', 'long_text', null, null, null, false, 47, null, null, null, null, null, null),
('c4000000-0000-0000-0000-000000000001', 'Final Review', 'client_approval', 'I confirm that the information and materials I provided are accurate and that I authorize MKB Financial Group to use them to customize my tax refund calculator.', 'checkbox_acknowledgment', null, null, null, true, 48, null, null, null, null, null, null)
on conflict (form_id, field_key) do update set
  section_name = excluded.section_name, label = excluded.label, field_type = excluded.field_type,
  help_text = excluded.help_text, placeholder = excluded.placeholder, default_value = excluded.default_value,
  is_required = excluded.is_required, display_order = excluded.display_order, options = excluded.options,
  file_config = excluded.file_config, conditional_on_field_key = excluded.conditional_on_field_key,
  conditional_on_values = excluded.conditional_on_values, static_content = excluded.static_content,
  contact_lead_map = excluded.contact_lead_map;
