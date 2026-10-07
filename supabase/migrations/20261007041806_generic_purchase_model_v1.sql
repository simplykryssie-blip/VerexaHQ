-- Purchase + Payment Integration V1: generalize firm_package_purchases
-- (already the most generic Purchase row -- it supports a connection-scoped
-- buyer OR an external partner-prospect buyer) to also support a plain
-- in-workspace client as the buyer, so a Service/Digital Product can be
-- sold directly to a workspace's own client with no Firm Connection and no
-- partner prospect involved. Table is NOT renamed (would touch every FK/
-- RLS/trigger/webhook-handler reference for a live financial table with
-- production history); it remains the one generic Purchase table for every
-- platform_products row, same pattern as extending firm_packages itself
-- for the generic Product model.

alter table public.firm_package_purchases
  add column if not exists client_id uuid references public.clients(id);

comment on column public.firm_package_purchases.client_id is 'Buyer is a plain in-workspace client (no Firm Connection, no external partner prospect) -- e.g. an ERO''s own client buying a Service or Digital Product directly. Exactly one of connection_id/partner_prospect_id/client_id is set, per firm_package_purchases_buyer_chk.';

alter table public.firm_package_purchases drop constraint firm_package_purchases_buyer_chk;
alter table public.firm_package_purchases add constraint firm_package_purchases_buyer_chk check (
  (case when connection_id is not null then 1 else 0 end
   + case when partner_prospect_id is not null then 1 else 0 end
   + case when client_id is not null then 1 else 0 end) = 1
);

-- known_automation_trigger_types already reserved 'digital_product.purchased'
-- (unused until now) -- follow that established per-product-type naming
-- convention rather than inventing a competing one, add its missing
-- counterpart ('digital_product.canceled') and the 'service.*' pair, and
-- also add the fully generic 'product.purchased'/'product.canceled' the
-- platform directive asks for literally, so a workspace can listen to
-- either the specific product type or every purchase/cancellation
-- regardless of type.
create or replace function public.known_automation_trigger_types()
returns text[]
language sql
immutable
as $$
  select array[
    'engagement.status_changed', 'organizer.submitted', 'client.tag_added', 'client.portal_created',
    'client.service_interest_selected', 'engagement.created', 'appointment.status_changed', 'appointment.booked',
    'engagement_letter.signed', 'document_request.completed', 'organizer_information_request.resolved',
    'organizer_response.review_decided', 'engagement.stage_entered', 'lead.created', 'lead.updated',
    'lead.assigned', 'lead.stage_entered', 'lead.status_changed', 'lead.converted_to_client', 'lead.marked_lost',
    'quote.created', 'quote.sent', 'quote.accepted', 'quote.declined', 'document_request.sent', 'document.uploaded',
    'task.created', 'task.completed', 'client_message.received', 'task.overdue', 'webhook.received',
    'engagement.due_date_reminder', 'quote.expiring_reminder', 'client.birthday_reminder', 'email.opened',
    'email.clicked', 'email.bounced', 'sms.delivered', 'sms.failed', 'invoice.sent', 'invoice.paid',
    'invoice.overdue', 'payment_plan.installment_paid', 'engagement_share.created', 'firm_package.purchased',
    'partner_package.purchased', 'firm_package.canceled', 'partner_onboarding.created',
    'partner_onboarding.status_changed',
    'task.assigned', 'task.reassigned', 'invoice.created', 'payment.failed',
    'digital_product.purchased', 'digital_product.canceled', 'service.purchased', 'service.canceled',
    'product.purchased', 'product.canceled'
  ]::text[];
$$;

-- Generalizes the purchase-completed/canceled trigger to also emit the
-- platform-generic 'product.purchased'/'product.canceled' events, and the
-- type-specific 'digital_product.*'/'service.*' events, alongside the
-- existing 'firm_package.purchased'/'partner_package.purchased'/
-- 'firm_package.canceled' ones -- which keep firing exactly as before, so
-- no existing automation's trigger_type match changes. Partner-onboarding
-- creation stays scoped to the connection/prospect buyer cases only -- a
-- plain client-direct purchase has no onboarding concept and must not
-- create a stray partner_onboardings row.
create or replace function public.fire_firm_package_purchase_automations()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_automation record;
  v_context jsonb;
  v_run_id uuid;
  v_events text[];
  v_base_event text;
  v_package record;
  v_buyer_name text;
  v_selected_labels jsonb;
  v_onboarding_id uuid;
begin
  if new.status = 'active' and old.status is distinct from 'active' then
    v_base_event := 'firm_package.purchased';
  elsif new.status = 'canceled' and old.status is distinct from 'canceled' then
    v_base_event := 'firm_package.canceled';
  else
    return new;
  end if;

  if new.partner_prospect_id is not null and v_base_event = 'firm_package.purchased' then
    v_base_event := 'partner_package.purchased';
  end if;

  select name, billing_cadence, purchase_purpose, product_type into v_package from public.firm_packages where id = new.package_id;

  -- Generic platform events fire alongside the legacy name, scoped by
  -- actual product_type (package stays represented by the legacy name
  -- alone -- a third synonym for the same thing would only add confusion),
  -- plus a fully type-agnostic event every workspace can rely on
  -- regardless of what it sells.
  v_events := array[v_base_event];
  if v_package.product_type in ('digital_product', 'service') then
    v_events := v_events || (case when v_base_event like '%.canceled' then v_package.product_type || '.canceled' else v_package.product_type || '.purchased' end);
  end if;
  v_events := v_events || (case when v_base_event like '%.canceled' then 'product.canceled' else 'product.purchased' end);

  if new.client_id is null and v_base_event in ('firm_package.purchased', 'partner_package.purchased')
     and coalesce(v_package.purchase_purpose, 'partner_onboarding') = 'partner_onboarding' then
    v_onboarding_id := public._get_or_create_partner_onboarding(new.parent_workspace_id, new.connection_id, new.package_id, new.id, new.partner_prospect_id);
  end if;

  select name into v_buyer_name from public.workspaces where id = new.workspace_id;
  select coalesce(jsonb_agg(o.label), '[]'::jsonb) into v_selected_labels
    from public.firm_package_options o where o.id = any(coalesce(new.selected_option_ids, '{}'::uuid[]));

  v_context := jsonb_build_object(
    'purchase_id', new.id,
    'package_id', new.package_id,
    'product_id', new.package_id,
    'product_type', v_package.product_type,
    'package_purchase.package_name', v_package.name,
    'package_purchase.billing_cadence', coalesce(new.billing_cadence, v_package.billing_cadence),
    'connection_id', new.connection_id,
    'partner_prospect_id', new.partner_prospect_id,
    'client_id', new.client_id,
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
      and trigger_type = any(v_events)
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
$$;
