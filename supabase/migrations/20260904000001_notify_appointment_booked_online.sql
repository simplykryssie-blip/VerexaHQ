-- Core, unconditional (opt-out) notification for "a client booked an
-- appointment online" -- via the public booking link or the client portal's
-- self-booking flow. Follows the exact pattern established in
-- 20260912150000_core_notification_toggles.sql (notify_payment_received,
-- notify_invoice_paid): its own dedicated trigger, gated by
-- is_notification_enabled() so it stays separate from the opt-in
-- Workflows/Automations system (which already has its own appointment.booked
-- trigger, added in 20260912190000_appointment_booked_automation_trigger.sql,
-- for firms that want to build a custom automation on top of this event).
--
-- Reuses the same identifying condition as that automation trigger: an
-- online-booked appointment always has created_by and external_source both
-- null (every other creation path -- staff manually adding one, calendar
-- sync -- sets one or the other).
create or replace function public.notify_appointment_booked_online()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_recipient_id uuid;
  v_client_name text;
begin
  if new.created_by is not null or new.external_source is not null then
    return new;
  end if;

  v_recipient_id := new.staff_id;

  if v_recipient_id is null and new.client_id is not null then
    select relationship_manager_id into v_recipient_id from public.clients where id = new.client_id;
  end if;

  if v_recipient_id is null then
    select user_id into v_recipient_id
    from public.workspace_users
    where workspace_id = new.workspace_id and is_owner = true and status = 'active'
    limit 1;
  end if;

  if v_recipient_id is null or not public.is_notification_enabled(v_recipient_id, new.workspace_id, 'APPOINTMENT_BOOKED_ONLINE', 'In-App') then
    return new;
  end if;

  if new.client_id is not null then
    select coalesce(nullif(trim(first_name || ' ' || last_name), ''), business_name, 'A client')
    into v_client_name
    from public.clients where id = new.client_id;
  end if;
  v_client_name := coalesce(v_client_name, 'A client');

  perform public.create_notification(
    new.workspace_id, v_recipient_id, 'APPOINTMENT_BOOKED_ONLINE', 'appointment_booked_online',
    jsonb_build_object('client_name', v_client_name, 'appointment_title', new.title, 'start_at', new.start_at::text),
    array['In-App'], 'High', 'client', new.client_id
  );

  return new;
end;
$function$;

drop trigger if exists trg_notify_appointment_booked_online on public.appointments;
create trigger trg_notify_appointment_booked_online
  after insert on public.appointments
  for each row execute function public.notify_appointment_booked_online();
