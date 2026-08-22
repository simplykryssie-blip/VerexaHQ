-- Gap #7 from the GHL capability audit: no way to react to how a client
-- engages with an automated email or text -- "they opened it," "they
-- clicked the link," "the text never delivered." email_log/sms_log
-- already record delivery status (from the Resend/Twilio webhook routes
-- added earlier), but had no link back to the notification job that
-- created them, so there was no way to resolve which client/engagement/
-- workspace a given delivery event belonged to. This adds that link and
-- five new trigger types built on top of it.

alter table public.email_log
  add column notification_queue_id uuid references public.notification_queue(id) on delete set null,
  add column clicked_at timestamptz,
  add column click_count integer not null default 0;

alter table public.sms_log
  add column notification_queue_id uuid references public.notification_queue(id) on delete set null;

-- email.opened / email.clicked / email.bounced: fires only for emails sent
-- through an automation step -- notification_queue_id is null for
-- anything else (e.g. portal invite emails), which don't have the
-- client/engagement context these triggers need. opened_at/clicked_at are
-- overwritten on every repeat open/click (see the Resend webhook route),
-- so the null-to-non-null transition below fires only on the first one.
create or replace function public.fire_email_engagement_event_automations()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_job record;
  v_client_id uuid;
  v_engagement_id uuid;
  v_trigger_type text;
  v_context jsonb;
  v_automation record;
  v_run_id uuid;
begin
  if new.notification_queue_id is null then
    return new;
  end if;

  if new.opened_at is not null and old.opened_at is null then
    v_trigger_type := 'email.opened';
  elsif new.clicked_at is not null and old.clicked_at is null then
    v_trigger_type := 'email.clicked';
  elsif new.status = 'bounced' and old.status is distinct from 'bounced' then
    v_trigger_type := 'email.bounced';
  else
    return new;
  end if;

  select entity_type, entity_id into v_job from public.notification_queue where id = new.notification_queue_id;

  if v_job.entity_type = 'client' then
    v_client_id := v_job.entity_id;
  elsif v_job.entity_type = 'engagement' then
    v_engagement_id := v_job.entity_id;
    select client_id into v_client_id from public.engagements where id = v_job.entity_id;
  else
    return new;
  end if;

  v_context := jsonb_build_object('email_log_id', new.id, 'template_key', new.template_key, 'recipient_email', new.recipient_email, 'subject', new.subject);

  for v_automation in
    select * from public.automations
    where workspace_id = new.workspace_id and is_enabled = true and status = 'published'
      and trigger_type = v_trigger_type
  loop
    if public.evaluate_automation_conditions(v_automation.conditions, v_context, new.workspace_id, v_client_id, v_engagement_id) then
      insert into public.automation_runs (workspace_id, automation_id, engagement_id, client_id, trigger_snapshot, status)
      values (new.workspace_id, v_automation.id, v_engagement_id, v_client_id, v_context, 'running')
      returning id into v_run_id;
      perform public.start_next_automation_step(v_run_id);
    end if;
  end loop;

  return new;
end;
$function$;

create trigger trg_fire_email_engagement_event_automations
  after update on public.email_log
  for each row execute function public.fire_email_engagement_event_automations();

-- sms.delivered / sms.failed: same shape, mirroring Twilio's terminal
-- statuses that matter for engagement (undelivered folds into failed --
-- both mean the text never reached the recipient).
create or replace function public.fire_sms_engagement_event_automations()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_job record;
  v_client_id uuid;
  v_engagement_id uuid;
  v_trigger_type text;
  v_context jsonb;
  v_automation record;
  v_run_id uuid;
begin
  if new.notification_queue_id is null then
    return new;
  end if;

  if new.status = 'delivered' and old.status is distinct from 'delivered' then
    v_trigger_type := 'sms.delivered';
  elsif new.status in ('failed', 'undelivered') and old.status not in ('failed', 'undelivered') then
    v_trigger_type := 'sms.failed';
  else
    return new;
  end if;

  select entity_type, entity_id into v_job from public.notification_queue where id = new.notification_queue_id;

  if v_job.entity_type = 'client' then
    v_client_id := v_job.entity_id;
  elsif v_job.entity_type = 'engagement' then
    v_engagement_id := v_job.entity_id;
    select client_id into v_client_id from public.engagements where id = v_job.entity_id;
  else
    return new;
  end if;

  v_context := jsonb_build_object('sms_log_id', new.id, 'template_key', new.template_key, 'recipient_phone', new.recipient_phone);

  for v_automation in
    select * from public.automations
    where workspace_id = new.workspace_id and is_enabled = true and status = 'published'
      and trigger_type = v_trigger_type
  loop
    if public.evaluate_automation_conditions(v_automation.conditions, v_context, new.workspace_id, v_client_id, v_engagement_id) then
      insert into public.automation_runs (workspace_id, automation_id, engagement_id, client_id, trigger_snapshot, status)
      values (new.workspace_id, v_automation.id, v_engagement_id, v_client_id, v_context, 'running')
      returning id into v_run_id;
      perform public.start_next_automation_step(v_run_id);
    end if;
  end loop;

  return new;
end;
$function$;

create trigger trg_fire_sms_engagement_event_automations
  after update on public.sms_log
  for each row execute function public.fire_sms_engagement_event_automations();
