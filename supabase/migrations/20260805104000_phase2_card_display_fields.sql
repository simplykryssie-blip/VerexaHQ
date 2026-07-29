-- Additive: persist safe, display-only card fields (brand + last4) on
-- workspace_subscriptions so Settings -> Subscription can show them without
-- re-fetching from Stripe. These are non-sensitive display fields only --
-- never the full card number, CVC, or raw payment-method payload.
alter table public.workspace_subscriptions
  add column if not exists card_brand text,
  add column if not exists card_last4 text;

alter table public.workspace_subscriptions
  drop constraint if exists workspace_subscriptions_card_last4_format_check;
alter table public.workspace_subscriptions
  add constraint workspace_subscriptions_card_last4_format_check
  check (card_last4 is null or card_last4 ~ '^[0-9]{4}$');

-- Extend the existing payment-method-attached processor (used by both the
-- payment_method.attached and setup_intent.succeeded webhook paths) to also
-- persist brand/last4 onto the row, not just into the sync-log jsonb.
-- Neither the function's signature nor its authorization/validation logic
-- changes -- only the final UPDATE gains two columns.
create or replace function public.process_stripe_payment_method_attached(
  p_stripe_event_id text,
  p_payment_method_id text,
  p_stripe_customer_id text,
  p_card_funding_type text,
  p_card_brand text default null::text,
  p_card_last4 text default null::text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_event public.stripe_webhook_events%rowtype;
  v_subscription public.workspace_subscriptions%rowtype;
  v_funding text;
  v_blocked boolean;
  v_reason text;
begin
  if auth.role()<>'service_role' then raise exception 'Service role required'; end if;
  if nullif(trim(coalesce(p_payment_method_id,'')),'') is null or p_payment_method_id !~ '^pm_[A-Za-z0-9]+$' then raise exception 'Valid Stripe payment method ID is required'; end if;
  if nullif(trim(coalesce(p_stripe_customer_id,'')),'') is null or p_stripe_customer_id !~ '^cus_[A-Za-z0-9]+$' then raise exception 'Valid Stripe customer ID is required'; end if;

  v_funding:=lower(nullif(trim(coalesce(p_card_funding_type,'')),''));
  if v_funding is null or v_funding not in ('credit','debit','prepaid','unknown') then raise exception 'Valid card funding type is required'; end if;
  if p_card_last4 is not null and p_card_last4 !~ '^[0-9]{4}$' then raise exception 'Invalid card last4'; end if;

  select * into v_event
  from public.stripe_webhook_events
  where stripe_event_id=p_stripe_event_id
  for update;

  if v_event.id is null then raise exception 'Stripe webhook event not found'; end if;
  if v_event.event_type<>'payment_method.attached' then raise exception 'Stripe event type mismatch'; end if;
  if v_event.processing_status<>'processing' and v_event.verexa_processing_status<>'processing' then raise exception 'Stripe event must be claimed'; end if;
  if v_event.object_id is not null and v_event.object_id is distinct from p_payment_method_id then raise exception 'Stripe payment method ID mismatch'; end if;
  if v_event.customer_id is not null and v_event.customer_id is distinct from p_stripe_customer_id then raise exception 'Stripe customer ID mismatch'; end if;

  select * into v_subscription
  from public.workspace_subscriptions
  where external_customer_id=p_stripe_customer_id
  for update;

  if v_subscription.id is null then raise exception 'Workspace subscription not found for Stripe customer'; end if;
  if v_event.workspace_id is not null and v_event.workspace_id is distinct from v_subscription.workspace_id then raise exception 'Stripe event workspace mismatch'; end if;
  if v_event.livemode is not null and v_subscription.stripe_livemode is not null and v_event.livemode is distinct from v_subscription.stripe_livemode then raise exception 'Stripe event mode mismatch'; end if;

  v_blocked:=v_funding='prepaid';
  v_reason:=case
    when v_blocked then 'Prepaid cards are not accepted for Verexa HQ billing.'
    when v_funding='unknown' then 'Card funding type could not be verified.'
    else null
  end;

  update public.workspace_subscriptions
  set payment_method_on_file=true,
      card_funding_type=v_funding,
      card_brand=nullif(left(coalesce(p_card_brand,''),50),''),
      card_last4=p_card_last4,
      prepaid_card_blocked=v_blocked,
      stripe_default_payment_method_id=p_payment_method_id,
      last_payment_method_check_at=now(),
      activation_block_reason=v_reason,
      updated_at=now()
  where id=v_subscription.id;

  insert into public.platform_stripe_subscription_sync_log(
    workspace_id,workspace_subscription_id,stripe_event_id,stripe_event_type,stripe_customer_id,
    sync_action,sync_status,new_values,error_message
  ) values (
    v_subscription.workspace_id,v_subscription.id,p_stripe_event_id,'payment_method.attached',p_stripe_customer_id,
    'record_payment_method_funding',case when v_blocked or v_funding='unknown' then 'warning' else 'success' end,
    jsonb_build_object('payment_method_id',p_payment_method_id,'card_funding_type',v_funding,'card_brand',left(p_card_brand,50),'card_last4',p_card_last4,'prepaid_card_blocked',v_blocked),
    v_reason
  );

  perform public.finalize_stripe_webhook_event(
    p_stripe_event_id,'processed',v_subscription.workspace_id,v_subscription.id,
    jsonb_build_object('action','payment_method_attached','payment_method_id',p_payment_method_id,'card_funding_type',v_funding,'prepaid_card_blocked',v_blocked),null
  );

  return jsonb_build_object('ok',true,'workspace_id',v_subscription.workspace_id,'workspace_subscription_id',v_subscription.id,'card_funding_type',v_funding,'prepaid_card_blocked',v_blocked,'can_activate',not v_blocked and v_funding<>'unknown');
end;
$function$;

revoke execute on function public.process_stripe_payment_method_attached(text, text, text, text, text, text) from public;
revoke execute on function public.process_stripe_payment_method_attached(text, text, text, text, text, text) from anon;
grant execute on function public.process_stripe_payment_method_attached(text, text, text, text, text, text) to service_role;
