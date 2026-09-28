-- Migration Reconciliation Phase 1.10A -- recovered from production.
--
-- Package <-> Stripe mapping: firm_packages gains stripe_payment_link_id
-- (matched against checkout.session.completed's own payment_link field),
-- stripe_price_id/stripe_product_id, and purchase_purpose so a purchase
-- only starts partner_onboardings when the package actually represents a
-- partner relationship (vs. service_only, which just records the purchase
-- and fires the purchase automations).
--
-- Also evolves the webhook-secret architecture introduced by
-- 20260917134844_partner_purchase_entrypoint_schema.sql: rather than
-- Verexa generating the signing secret server-side
-- (set_partner_purchase_webhook, dropped here), the workspace now mints its
-- own endpoint token and pastes back whatever secret Stripe issues for it
-- (ensure_partner_purchase_webhook + set_partner_purchase_webhook_secret) --
-- works against any independent Stripe account, no Stripe Connect needed.
--
-- Also fixes a latent _evaluate_condition_list gap (unrelated to the
-- partner-purchase work but found while extending its condition context):
-- a nested trigger_snapshot field (e.g. package_purchase.package_name) had
-- no fallback resolution path when the flat top-level lookup missed it.
-- Adds JSON path traversal as a fallback only -- no existing condition's
-- behavior changes.
--
-- Recovered from production's recorded statements (not the matching branch
-- file, which included ~5KB of content beyond what was actually applied) --
-- byte-for-byte source of truth per this engagement's established
-- precedent whenever branch and production text diverge.
--
-- Confidence: A -- exact original recovered from
-- supabase_migrations.schema_migrations.statements (byte-for-byte).
alter table public.firm_packages
  add column if not exists stripe_payment_link_id text,
  add column if not exists stripe_price_id text,
  add column if not exists stripe_product_id text,
  add column if not exists purchase_purpose text not null default 'partner_onboarding'
    check (purchase_purpose in ('partner_onboarding', 'service_only'));

comment on column public.firm_packages.stripe_payment_link_id is 'Stripe Payment Link id (plink_...) for a package sold via an externally-hosted (e.g. public marketing site) Stripe Payment Link -- matched against checkout.session.completed''s own payment_link field, which requires no extra Stripe API call to resolve.';
comment on column public.firm_packages.stripe_price_id is 'Stripe Price id (price_...) -- the canonical line-item identity for this package''s Stripe-side product, kept alongside the payment link for a future Verexa-generated-checkout path that references a Price directly rather than a Payment Link.';
comment on column public.firm_packages.stripe_product_id is 'Stripe Product id (prod_...), informational -- not currently used for matching (Price/Payment Link are more specific), kept for display and future use.';
comment on column public.firm_packages.purchase_purpose is 'partner_onboarding: purchasing this package starts partner_onboardings (the existing Service Bureau/ERO/PTIN partner flow). service_only: a purchase is recorded and fires firm_package.purchased/partner_package.purchased automations same as before, but never creates a partner_onboardings row -- for packages that represent a plain service/product sale, not a partner relationship.';

create unique index if not exists firm_packages_stripe_payment_link_uidx
  on public.firm_packages (workspace_id, stripe_payment_link_id)
  where stripe_payment_link_id is not null;

create unique index if not exists firm_packages_stripe_price_uidx
  on public.firm_packages (workspace_id, stripe_price_id)
  where stripe_price_id is not null;

create or replace function public.fire_firm_package_purchase_automations()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_automation record;
  v_context jsonb;
  v_run_id uuid;
  v_event text;
  v_package record;
  v_buyer_name text;
  v_selected_labels jsonb;
  v_onboarding_id uuid;
begin
  if new.status = 'active' and old.status is distinct from 'active' then
    v_event := 'firm_package.purchased';
  elsif new.status = 'canceled' and old.status is distinct from 'canceled' then
    v_event := 'firm_package.canceled';
  else
    return new;
  end if;

  if new.partner_prospect_id is not null and v_event = 'firm_package.purchased' then
    v_event := 'partner_package.purchased';
  end if;

  select name, billing_cadence, purchase_purpose into v_package from public.firm_packages where id = new.package_id;

  if v_event in ('firm_package.purchased', 'partner_package.purchased') and coalesce(v_package.purchase_purpose, 'partner_onboarding') = 'partner_onboarding' then
    v_onboarding_id := public._get_or_create_partner_onboarding(new.parent_workspace_id, new.connection_id, new.package_id, new.id, new.partner_prospect_id);
  end if;

  select name into v_buyer_name from public.workspaces where id = new.workspace_id;
  select coalesce(jsonb_agg(o.label), '[]'::jsonb) into v_selected_labels
    from public.firm_package_options o where o.id = any(coalesce(new.selected_option_ids, '{}'::uuid[]));

  v_context := jsonb_build_object(
    'purchase_id', new.id,
    'package_id', new.package_id,
    'package_purchase.package_name', v_package.name,
    'package_purchase.billing_cadence', coalesce(new.billing_cadence, v_package.billing_cadence),
    'connection_id', new.connection_id,
    'partner_prospect_id', new.partner_prospect_id,
    'buyer_workspace_name', coalesce(v_buyer_name, new.purchaser_name),
    'amount', new.amount,
    'selected_options', v_selected_labels,
    'purchaser_name', new.purchaser_name,
    'purchaser_email', new.purchaser_email,
    'purchaser_phone', new.purchaser_phone,
    'currency', new.currency,
    'payment_status', new.status,
    'payment_provider', new.payment_provider,
    'payment_reference', new.payment_reference,
    'purchased_at', new.purchased_at,
    'source', new.source,
    'external_customer_id', new.external_customer_id,
    'external_checkout_session_id', new.external_checkout_session_id,
    'external_payment_id', new.external_payment_id
  );

  for v_automation in
    select * from public.automations
    where workspace_id = new.parent_workspace_id and is_enabled = true and status = 'published'
      and trigger_type = v_event
  loop
    if public.evaluate_automation_conditions(v_automation.conditions, v_context, new.parent_workspace_id, null, null, new.connection_id, null) then
      insert into public.automation_runs (workspace_id, automation_id, connection_id, partner_prospect_id, onboarding_id, trigger_snapshot, status)
      values (new.parent_workspace_id, v_automation.id, new.connection_id, new.partner_prospect_id, v_onboarding_id, v_context, 'running')
      returning id into v_run_id;
      perform public.start_next_automation_step(v_run_id);
    end if;
  end loop;

  return new;
end;
$function$;

alter table public.workspace_partner_purchase_webhooks
  alter column signing_secret_encrypted drop not null;

drop function if exists public.set_partner_purchase_webhook(uuid);

create or replace function public.ensure_partner_purchase_webhook(p_workspace_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_token uuid;
begin
  if not public.is_workspace_admin(p_workspace_id) then
    raise exception 'insufficient permissions to configure a purchase webhook for this workspace';
  end if;

  insert into public.workspace_partner_purchase_webhooks (workspace_id, signing_secret_encrypted, created_by)
  values (p_workspace_id, null, auth.uid())
  on conflict (workspace_id) do nothing;

  select endpoint_token into v_token from public.workspace_partner_purchase_webhooks where workspace_id = p_workspace_id;
  return v_token;
end;
$function$;

revoke all on function public.ensure_partner_purchase_webhook(uuid) from public, anon;
grant execute on function public.ensure_partner_purchase_webhook(uuid) to authenticated;

create or replace function public.set_partner_purchase_webhook_secret(p_workspace_id uuid, p_signing_secret text)
returns void
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
begin
  if not public.is_workspace_admin(p_workspace_id) then
    raise exception 'insufficient permissions to configure a purchase webhook for this workspace';
  end if;
  if nullif(btrim(coalesce(p_signing_secret, '')), '') is null then
    raise exception 'a signing secret is required';
  end if;

  insert into public.workspace_partner_purchase_webhooks (workspace_id, signing_secret_encrypted, created_by)
  values (p_workspace_id, public.encrypt_firm_secret(btrim(p_signing_secret)), auth.uid())
  on conflict (workspace_id) do update
    set signing_secret_encrypted = excluded.signing_secret_encrypted,
        created_by = excluded.created_by,
        rotated_at = now();
end;
$function$;

revoke all on function public.set_partner_purchase_webhook_secret(uuid, text) from public, anon;
grant execute on function public.set_partner_purchase_webhook_secret(uuid, text) to authenticated;

drop function if exists public.get_partner_purchase_webhook_status(uuid);

create or replace function public.get_partner_purchase_webhook_status(p_workspace_id uuid)
returns table (configured boolean, endpoint_token uuid, has_secret boolean, rotated_at timestamptz)
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not public.is_workspace_admin(p_workspace_id) then
    raise exception 'insufficient permissions to view this workspace''s purchase webhook';
  end if;

  return query
  select true, w.endpoint_token, (w.signing_secret_encrypted is not null), w.rotated_at
  from public.workspace_partner_purchase_webhooks w
  where w.workspace_id = p_workspace_id
  union all
  select false, null::uuid, false, null::timestamptz
  where not exists (select 1 from public.workspace_partner_purchase_webhooks where workspace_id = p_workspace_id)
  limit 1;
end;
$function$;

revoke all on function public.get_partner_purchase_webhook_status(uuid) from public, anon;
grant execute on function public.get_partner_purchase_webhook_status(uuid) to authenticated;

create or replace function public._evaluate_condition_list(p_conditions jsonb, p_context jsonb, p_workspace_id uuid, p_client_id uuid, p_engagement_id uuid, p_connection_id uuid DEFAULT NULL::uuid, p_onboarding_id uuid DEFAULT NULL::uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
declare
  v_cond jsonb;
  v_field text;
  v_op text;
  v_join text;
  v_expected text;
  v_actual text;
  v_client record;
  v_engagement record;
  v_interest record;
  v_portal record;
  v_quote record;
  v_task record;
  v_doc_request record;
  v_connection record;
  v_onboarding record;
  v_process_id uuid;
  v_process_stage_id uuid;
  v_lead_process_stage_id uuid;
  v_org_template_id_raw text;
  v_org_template_id uuid;
  v_org_expected_status text;
  v_org_actual_status text;
  v_doc_step_id_raw text;
  v_doc_expected_signed text;
  v_doc_actual_status text;
  v_task_step_id_raw text;
  v_task_expected_completed text;
  v_task_actual_status text;
  v_decision_step_id_raw text;
  v_decision_expected_option text;
  v_decision_actual_option text;
  v_match boolean;
  v_result boolean;
  v_index int := 0;
begin
  if p_conditions is null or jsonb_array_length(p_conditions) = 0 then
    return true;
  end if;

  select * into v_client from public.clients where id = p_client_id;
  select * into v_interest from public.client_service_interests where client_id = p_client_id order by created_at desc limit 1;
  select * into v_portal from public.client_portal_users where client_id = p_client_id order by invited_at desc limit 1;
  select * into v_engagement from public.engagements where id = p_engagement_id;
  select pr.process_id, ps.process_stage_id into v_process_id, v_process_stage_id
  from public.pipeline_runs pr
  join public.pipeline_stages ps on ps.id = pr.current_stage_id
  where pr.entity_type = 'engagement' and pr.entity_id = p_engagement_id and pr.status = 'Active'
  order by pr.started_at desc limit 1;
  select ps.process_stage_id into v_lead_process_stage_id
  from public.pipeline_runs pr
  join public.pipeline_stages ps on ps.id = pr.current_stage_id
  where pr.entity_type = 'client' and pr.entity_id = p_client_id and pr.status = 'Active'
  order by pr.started_at desc limit 1;
  select * into v_quote from public.quotes
  where (p_engagement_id is not null and engagement_id = p_engagement_id)
     or (p_client_id is not null and client_id = p_client_id)
  order by created_at desc limit 1;
  select * into v_task from public.tasks where id = nullif(p_context->>'task_id', '')::uuid;
  select * into v_doc_request from public.document_requests where id = nullif(p_context->>'document_request_id', '')::uuid;

  select fc.* into v_connection
  from public.firm_connections fc
  where fc.id = p_connection_id and fc.parent_workspace_id = p_workspace_id;

  select po.* into v_onboarding
  from public.partner_onboardings po
  where po.id = p_onboarding_id and po.workspace_id = p_workspace_id;

  for v_cond in select * from jsonb_array_elements(p_conditions)
  loop
    v_index := v_index + 1;
    v_field := v_cond->>'field';
    v_op := coalesce(v_cond->>'op', 'eq');
    v_join := coalesce(v_cond->>'join', 'and');
    v_expected := v_cond->>'value';

    if v_field = 'client.tags' then
      v_match := v_expected = any(coalesce(v_client.tags, '{}'::text[]));
      if v_op = 'neq' then
        v_match := not v_match;
      end if;
    elsif v_field = 'document_request.all_required_complete' then
      v_match := (coalesce(v_expected, 'true') = 'true') = not exists (
        select 1 from public.document_request_item_statuses
        where document_request_id = coalesce((p_context->>'document_request_id')::uuid, v_doc_request.id)
          and is_required = true and status = 'pending'
      );
    elsif v_field = 'client.organizer_status' then
      v_org_template_id_raw := split_part(coalesce(v_expected, ''), '|', 1);
      v_org_expected_status := split_part(coalesce(v_expected, ''), '|', 2);
      v_org_template_id := case
        when v_org_template_id_raw = 'current_run' then nullif(p_context->>'last_organizer_template_id', '')::uuid
        when v_org_template_id_raw = 'client_service' then (
          select ot.id
          from public.services s
          join public.organizer_templates svc_ot on svc_ot.id = s.organizer_template_id
          join public.organizer_templates ot on ot.slug = svc_ot.slug and ot.workspace_id = p_workspace_id
          where s.id = coalesce(nullif(p_context->>'service_id', '')::uuid, v_interest.service_id)
          limit 1
        )
        else nullif(v_org_template_id_raw, '')::uuid
      end;
      select status into v_org_actual_status
      from public.organizer_responses
      where client_id = p_client_id and organizer_template_id = v_org_template_id
      order by created_at desc
      limit 1;
      v_match := coalesce(v_org_actual_status, 'not_sent') = v_org_expected_status;
      if v_op = 'neq' then
        v_match := not v_match;
      end if;
    elsif v_field = 'run.document_signed' then
      v_doc_step_id_raw := split_part(coalesce(v_expected, ''), '|', 1);
      v_doc_expected_signed := coalesce(nullif(split_part(coalesce(v_expected, ''), '|', 2), ''), 'true');
      select sr.status into v_doc_actual_status
      from public.signature_requests sr
      where sr.id = nullif(p_context->'document_signatures'->>v_doc_step_id_raw, '')::uuid;
      v_match := (coalesce(v_doc_actual_status, 'not_sent') = 'completed') = (v_doc_expected_signed = 'true');
      if v_op = 'neq' then
        v_match := not v_match;
      end if;
    elsif v_field = 'run.task_completed' then
      v_task_step_id_raw := split_part(coalesce(v_expected, ''), '|', 1);
      v_task_expected_completed := coalesce(nullif(split_part(coalesce(v_expected, ''), '|', 2), ''), 'true');
      select t.status into v_task_actual_status
      from public.tasks t
      where t.id = nullif(p_context->'created_tasks'->>v_task_step_id_raw, '')::uuid;
      v_match := (coalesce(v_task_actual_status, 'pending') = 'completed') = (v_task_expected_completed = 'true');
      if v_op = 'neq' then
        v_match := not v_match;
      end if;
    elsif v_field = 'run.decision' then
      v_decision_step_id_raw := split_part(coalesce(v_expected, ''), '|', 1);
      v_decision_expected_option := split_part(coalesce(v_expected, ''), '|', 2);
      v_decision_actual_option := p_context->'decisions'->>v_decision_step_id_raw;
      v_match := v_decision_actual_option is not distinct from v_decision_expected_option;
      if v_op = 'neq' then
        v_match := not v_match;
      end if;
    else
      v_actual := case v_field
        when 'client.lifecycle_status' then v_client.lifecycle_status
        when 'client.client_type' then v_client.client_type
        when 'client.relationship_manager_id' then v_client.relationship_manager_id::text
        when 'client.service_category_id' then v_interest.service_category_id::text
        when 'client.service_id' then v_interest.service_id::text
        when 'client.source' then v_interest.source
        when 'client.portal_status' then coalesce(v_portal.status, 'not_sent')
        when 'lead.process_stage_id' then v_lead_process_stage_id::text
        when 'engagement.status' then v_engagement.status
        when 'engagement.priority' then v_engagement.priority::text
        when 'engagement.case_type' then v_engagement.case_type
        when 'engagement.service_id' then v_engagement.service_id::text
        when 'engagement.assigned_staff_id' then v_engagement.assigned_staff_id::text
        when 'engagement.reviewer_id' then v_engagement.reviewer_id::text
        when 'engagement.process_id' then v_process_id::text
        when 'engagement.process_stage_id' then v_process_stage_id::text
        when 'engagement.engagement_letter_status' then coalesce(
          nullif((
            select sr.status
            from public.signature_requests sr
            join public.attachments a on a.id = sr.attachment_id
            where a.entity_type = 'engagement' and a.entity_id = p_engagement_id
            order by sr.created_at desc
            limit 1
          ), 'cancelled'),
          'not_sent'
        )
        when 'engagement.document_signed' then (coalesce(
          nullif((
            select sr.status
            from public.signature_requests sr
            join public.attachments a on a.id = sr.attachment_id
            where a.entity_type = 'engagement' and a.entity_id = p_engagement_id
            order by sr.created_at desc
            limit 1
          ), 'cancelled'),
          'not_sent'
        ) = 'completed')::text
        when 'quote.status' then v_quote.status
        when 'quote.total_amount' then v_quote.total_amount::text
        when 'task.status' then v_task.status
        when 'task.assigned_staff_id' then v_task.assigned_staff_id::text
        when 'task.overdue' then (v_task.due_date is not null and v_task.due_date < now() and v_task.status <> 'completed')::text
        when 'document_request.status' then v_doc_request.status
        when 'partner_onboarding.status' then v_onboarding.status
        when 'partner_onboarding.application_submitted' then (v_onboarding.application_submitted_at is not null)::text
        when 'partner_onboarding.agreement_signed' then (exists (
          select 1 from public.signature_requests sr
          where sr.id = v_onboarding.agreement_signature_request_id and sr.status = 'completed'
        ))::text
        when 'partner_onboarding.documents_complete' then (exists (
          select 1 from public.document_requests dr
          where dr.id = v_onboarding.document_request_id and dr.status = 'completed'
        ))::text
        when 'partner_onboarding.training_complete' then (v_onboarding.training_completed_at is not null)::text
        when 'partner_onboarding.bank_software_setup_complete' then (v_onboarding.bank_software_setup_completed_at is not null)::text
        when 'partner_onboarding.review_status' then v_onboarding.review_decision
        when 'partner_onboarding.ready' then (v_onboarding.status = 'ready')::text
        when 'firm_connection.relationship_type' then v_connection.relationship_type
        when 'firm_connection.package_id' then v_connection.package_id::text
        else coalesce(p_context ->> v_field, case when v_field like '%.%' then p_context #>> string_to_array(v_field, '.') else null end)
      end;

      if v_op = 'eq' then
        v_match := v_actual is not distinct from v_expected;
      elsif v_op = 'neq' then
        v_match := v_actual is distinct from v_expected;
      elsif v_op = 'in' then
        v_match := v_actual = any(string_to_array(coalesce(v_expected, ''), ','));
      elsif v_op = 'not_in' then
        v_match := v_actual is not null and not (v_actual = any(string_to_array(coalesce(v_expected, ''), ',')));
      elsif v_op = 'gt' then
        v_match := v_actual is not null and v_expected is not null and v_actual::numeric > v_expected::numeric;
      elsif v_op = 'gte' then
        v_match := v_actual is not null and v_expected is not null and v_actual::numeric >= v_expected::numeric;
      elsif v_op = 'lt' then
        v_match := v_actual is not null and v_expected is not null and v_actual::numeric < v_expected::numeric;
      elsif v_op = 'lte' then
        v_match := v_actual is not null and v_expected is not null and v_actual::numeric <= v_expected::numeric;
      elsif v_op = 'is_null' then
        v_match := v_actual is null;
      elsif v_op = 'is_not_null' then
        v_match := v_actual is not null;
      else
        v_match := true;
      end if;
    end if;

    if v_index = 1 then
      v_result := v_match;
    elsif v_join = 'or' then
      v_result := v_result or v_match;
    else
      v_result := v_result and v_match;
    end if;
  end loop;

  return v_result;
end;
$function$;

create or replace function public.test_condition_evaluator_nested_field_resolution()
returns table (check_name text, passed boolean)
language plpgsql
stable
set search_path to 'public'
as $function$
declare
  v_nested_context jsonb := jsonb_build_object('package_purchase', jsonb_build_object('package_name', 'Gold Tier'));
  v_flat_context jsonb := jsonb_build_object('package_purchase.package_name', 'Gold Tier');
  v_plain_context jsonb := jsonb_build_object('some_field', 'some_value');
begin
  return query select 'nested package_purchase.package_name resolves'::text,
    public.evaluate_automation_conditions(
      jsonb_build_array(jsonb_build_object('field', 'package_purchase.package_name', 'op', 'eq', 'value', 'Gold Tier')),
      v_nested_context, gen_random_uuid(), null, null
    ) is true;

  return query select 'flat literal-key package_purchase.package_name still resolves'::text,
    public.evaluate_automation_conditions(
      jsonb_build_array(jsonb_build_object('field', 'package_purchase.package_name', 'op', 'eq', 'value', 'Gold Tier')),
      v_flat_context, gen_random_uuid(), null, null
    ) is true;

  return query select 'nested field mismatch correctly fails'::text,
    public.evaluate_automation_conditions(
      jsonb_build_array(jsonb_build_object('field', 'package_purchase.package_name', 'op', 'eq', 'value', 'Silver Tier')),
      v_nested_context, gen_random_uuid(), null, null
    ) is false;

  return query select 'unrelated non-dotted field still resolves'::text,
    public.evaluate_automation_conditions(
      jsonb_build_array(jsonb_build_object('field', 'some_field', 'op', 'eq', 'value', 'some_value')),
      v_plain_context, gen_random_uuid(), null, null
    ) is true;

  return query select 'unknown dotted field with no data anywhere resolves to no match'::text,
    public.evaluate_automation_conditions(
      jsonb_build_array(jsonb_build_object('field', 'nonexistent.nested.field', 'op', 'eq', 'value', 'x')),
      v_plain_context, gen_random_uuid(), null, null
    ) is false;
end;
$function$;

revoke all on function public.test_condition_evaluator_nested_field_resolution() from public, anon, authenticated;
grant execute on function public.test_condition_evaluator_nested_field_resolution() to service_role;
