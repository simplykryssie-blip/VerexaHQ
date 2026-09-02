-- User feedback: "I don't want to have to create automations for staff to
-- get notifications for important things." Confirms the product intent --
-- a handful of important events should notify automatically, with a
-- per-person off-switch in Settings, entirely separate from the opt-in
-- Workflows/Automations system. document_request_completed already worked
-- this way but had no off-switch; organizer.submitted already worked this
-- way (_notify_admins_of_organizer_submitted) but also had no off-switch.
-- This migration: (1) gives both of those a real off-switch via the
-- existing is_notification_enabled()/notification_preferences mechanism,
-- and (2) adds three more core, unconditional notifications for events that
-- previously only fired if a firm hand-built a Workflow: a payment coming
-- in, an invoice becoming fully paid, and an organizer being
-- reviewed/approved.

-- 1. document_request_completed: add the off-switch (was unconditional).
create or replace function public.notify_staff_document_request_completed()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_workspace_id uuid;
  v_client_id uuid;
  v_recipient_id uuid;
  v_client_name text;
  v_request_title text;
begin
  if new.status <> 'completed' or old.status is not distinct from 'completed' then
    return new;
  end if;

  if new.entity_type = 'engagement' then
    select e.workspace_id, e.client_id, e.assigned_staff_id,
      coalesce(nullif(trim(c.first_name || ' ' || c.last_name), ''), c.business_name, 'A client')
    into v_workspace_id, v_client_id, v_recipient_id, v_client_name
    from public.engagements e
    left join public.clients c on c.id = e.client_id
    where e.id = new.entity_id;
  elsif new.entity_type = 'client' then
    v_client_id := new.entity_id;
    select workspace_id, relationship_manager_id,
      coalesce(nullif(trim(first_name || ' ' || last_name), ''), business_name, 'A client')
    into v_workspace_id, v_recipient_id, v_client_name
    from public.clients where id = new.entity_id;
  else
    return new;
  end if;

  if v_workspace_id is null then
    return new;
  end if;

  if v_recipient_id is null then
    select user_id into v_recipient_id
    from public.workspace_users
    where workspace_id = v_workspace_id and is_owner = true and status = 'active'
    limit 1;
  end if;

  if v_recipient_id is null or not public.is_notification_enabled(v_recipient_id, v_workspace_id, 'DOCUMENT_REQUEST_COMPLETED', 'In-App') then
    return new;
  end if;

  v_request_title := coalesce(new.title, 'Document request');

  perform public.create_notification(
    v_workspace_id, v_recipient_id, 'DOCUMENT_REQUEST_COMPLETED', 'document_request_completed',
    jsonb_build_object('client_name', v_client_name, 'request_title', v_request_title),
    array['In-App'], 'Medium', new.entity_type, new.entity_id
  );

  return new;
end;
$function$;

-- 2. organizer.submitted: add the off-switch (was unconditional, broadcast
-- to every owner/admin).
create or replace function public._notify_admins_of_organizer_submitted(
  p_workspace_id uuid,
  p_client_id uuid,
  p_response_id uuid,
  p_organizer_template_id uuid
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_recipient record;
  v_template_name text;
  v_client_name text;
begin
  select name into v_template_name from public.organizer_templates where id = p_organizer_template_id;

  select case when client_type = 'business' and business_name is not null then business_name
              else btrim(coalesce(first_name, '') || ' ' || coalesce(last_name, ''))
         end
  into v_client_name
  from public.clients where id = p_client_id;

  for v_recipient in
    select wu.user_id from public.workspace_users wu
    join public.roles r on r.id = wu.role_id
    where wu.workspace_id = p_workspace_id and wu.status = 'active'
      and (wu.is_owner or r.slug in ('owner', 'admin'))
  loop
    if public.is_notification_enabled(v_recipient.user_id, p_workspace_id, 'ORGANIZER_SUBMITTED', 'In-App') then
      perform public.create_notification(
        p_workspace_id, v_recipient.user_id, 'ORGANIZER_SUBMITTED',
        'organizer_submitted',
        jsonb_build_object('client_id', p_client_id, 'client_name', v_client_name, 'response_id', p_response_id, 'organizer_template_name', v_template_name),
        array['In-App'::text], 'Medium', 'client', p_client_id
      );
    end if;
  end loop;
end;
$function$;

-- 3. New: organizer reviewed/approved. Notifies whoever's actually working
-- the client (relationship manager), not every admin -- this is "your
-- client's paperwork is ready for the next step", not "something new needs
-- picking up".
create or replace function public.notify_organizer_reviewed()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_recipient_id uuid;
  v_client_name text;
begin
  if new.review_status is null or new.review_status is not distinct from old.review_status then
    return new;
  end if;

  select relationship_manager_id,
    coalesce(nullif(trim(first_name || ' ' || last_name), ''), business_name, 'A client')
  into v_recipient_id, v_client_name
  from public.clients where id = new.client_id;

  if v_recipient_id is null then
    select user_id into v_recipient_id
    from public.workspace_users
    where workspace_id = new.workspace_id and is_owner = true and status = 'active'
    limit 1;
  end if;

  if v_recipient_id is null or not public.is_notification_enabled(v_recipient_id, new.workspace_id, 'ORGANIZER_REVIEWED', 'In-App') then
    return new;
  end if;

  perform public.create_notification(
    new.workspace_id, v_recipient_id, 'ORGANIZER_REVIEWED', 'organizer_reviewed',
    jsonb_build_object('client_name', v_client_name, 'review_status', new.review_status::text),
    array['In-App'], 'Medium', 'client', new.client_id
  );

  return new;
end;
$function$;

drop trigger if exists trg_notify_organizer_reviewed on public.organizer_responses;
create trigger trg_notify_organizer_reviewed
  after update of review_status on public.organizer_responses
  for each row execute function public.notify_organizer_reviewed();

-- 4. New: a payment comes in (any amount, any method -- manual or Stripe).
create or replace function public.notify_payment_received()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_recipient_id uuid;
  v_client_name text;
  v_invoice_number text;
  v_engagement_id uuid;
begin
  select i.engagement_id, i.invoice_number,
    coalesce(nullif(trim(c.first_name || ' ' || c.last_name), ''), c.business_name, 'A client')
  into v_engagement_id, v_invoice_number, v_client_name
  from public.invoices i
  left join public.clients c on c.id = i.client_id
  where i.id = new.invoice_id;

  if v_engagement_id is not null then
    select assigned_staff_id into v_recipient_id from public.engagements where id = v_engagement_id;
  end if;
  if v_recipient_id is null then
    select relationship_manager_id into v_recipient_id from public.clients where id = new.client_id;
  end if;
  if v_recipient_id is null then
    select user_id into v_recipient_id
    from public.workspace_users
    where workspace_id = new.workspace_id and is_owner = true and status = 'active'
    limit 1;
  end if;

  if v_recipient_id is null or not public.is_notification_enabled(v_recipient_id, new.workspace_id, 'PAYMENT_RECEIVED', 'In-App') then
    return new;
  end if;

  perform public.create_notification(
    new.workspace_id, v_recipient_id, 'PAYMENT_RECEIVED', 'payment_received',
    jsonb_build_object('client_name', v_client_name, 'invoice_number', v_invoice_number, 'amount', new.amount::text),
    array['In-App'], 'Medium', 'client', new.client_id
  );

  return new;
end;
$function$;

drop trigger if exists trg_notify_payment_received on public.payments;
create trigger trg_notify_payment_received
  after insert on public.payments
  for each row execute function public.notify_payment_received();

-- 5. New: an invoice's balance hits zero -- distinct from "a payment came
-- in", since a partial payment doesn't fully resolve the invoice.
create or replace function public.notify_invoice_paid()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_recipient_id uuid;
  v_client_name text;
begin
  if new.status <> 'paid' or old.status is not distinct from 'paid' then
    return new;
  end if;

  select coalesce(nullif(trim(c.first_name || ' ' || c.last_name), ''), c.business_name, 'A client')
  into v_client_name
  from public.clients c where c.id = new.client_id;

  if new.engagement_id is not null then
    select assigned_staff_id into v_recipient_id from public.engagements where id = new.engagement_id;
  end if;
  if v_recipient_id is null then
    select relationship_manager_id into v_recipient_id from public.clients where id = new.client_id;
  end if;
  if v_recipient_id is null then
    select user_id into v_recipient_id
    from public.workspace_users
    where workspace_id = new.workspace_id and is_owner = true and status = 'active'
    limit 1;
  end if;

  if v_recipient_id is null or not public.is_notification_enabled(v_recipient_id, new.workspace_id, 'INVOICE_PAID', 'In-App') then
    return new;
  end if;

  perform public.create_notification(
    new.workspace_id, v_recipient_id, 'INVOICE_PAID', 'invoice_paid',
    jsonb_build_object('client_name', v_client_name, 'invoice_number', new.invoice_number, 'total_amount', new.total_amount::text),
    array['In-App'], 'Medium', 'client', new.client_id
  );

  return new;
end;
$function$;

drop trigger if exists trg_notify_invoice_paid on public.invoices;
create trigger trg_notify_invoice_paid
  after update of status on public.invoices
  for each row execute function public.notify_invoice_paid();
