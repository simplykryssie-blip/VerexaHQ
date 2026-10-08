-- Two related gaps found while investigating why a service-bureau workspace
-- with two verified sending domains couldn't route different clients'
-- emails through different domains, and why a custom-domain send still
-- showed "Verexa HQ CRM" as the display name.
--
-- 1. sendEmailViaResend picks whichever verified domain is marked primary --
-- fine for a single-brand workspace, but a service bureau running two
-- brands under one workspace (e.g. its own tax practice plus a partner
-- recruiting/software brand) needs different emails to go out under
-- different domains. Domain choice belongs on the branded content itself,
-- not on the generic notification wrapper: organizer_templates gets a
-- sending_domain_id, notify_organizer_information_request resolves it from
-- the response's own organizer_template and carries it onto the queued
-- notification_queue row, and dispatch-notifications/sendEmailViaResend
-- (app-code changes, separate from this migration) use it when present,
-- falling back to the workspace's primary verified domain otherwise.
--
-- engagement_letter_templates was considered for the same treatment, but
-- there is currently no email notification tied to a specific engagement
-- letter template to route (the public /e/[token] signing flow doesn't
-- send the client any email at all) -- added if/when that exists, not
-- speculatively now.
--
-- A trigger enforces that a template's sending_domain_id can only ever
-- reference a domain belonging to that same template's own workspace --
-- the FK alone doesn't cross-check workspace_id.
alter table public.organizer_templates
  add column sending_domain_id uuid references public.workspace_email_domains(id);

alter table public.notification_queue
  add column domain_id uuid references public.workspace_email_domains(id);

CREATE OR REPLACE FUNCTION public.validate_organizer_template_sending_domain()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if new.sending_domain_id is not null and not exists (
    select 1 from public.workspace_email_domains d
    where d.id = new.sending_domain_id and d.workspace_id = new.workspace_id
  ) then
    raise exception 'sending_domain_id must belong to this template''s own workspace';
  end if;
  return new;
end;
$function$;

create trigger validate_organizer_template_sending_domain
  before insert or update of sending_domain_id, workspace_id on public.organizer_templates
  for each row execute function public.validate_organizer_template_sending_domain();

-- 2. branding.email_from_name/reply_to_email have existed since the
-- multi-domain migration but were never read anywhere (per PLATFORM.md's
-- own note: "the columns exist, the read side doesn't yet"). No DB change
-- needed for that half -- sendEmailViaResend (app code) now reads them.
CREATE OR REPLACE FUNCTION public.notify_organizer_information_request(p_request_id uuid, p_message text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_workspace_id uuid;
  v_client_id uuid;
  v_send_email boolean;
  v_send_sms boolean;
  v_show_in_portal boolean;
  v_entity_type text;
  v_entity_id uuid;
  v_primary_email text;
  v_primary_phone text;
  v_thread_id uuid;
  v_domain_id uuid;
begin
  select req.workspace_id, r.client_id, req.sent_via_email, req.sent_via_sms, req.shown_in_portal,
    case when r.engagement_id is not null then 'engagement' else 'client' end, coalesce(r.engagement_id, r.client_id),
    ot.sending_domain_id
  into v_workspace_id, v_client_id, v_send_email, v_send_sms, v_show_in_portal, v_entity_type, v_entity_id,
    v_domain_id
  from public.organizer_information_requests req
  join public.organizer_responses r on r.id = req.organizer_response_id
  left join public.organizer_templates ot on ot.id = r.organizer_template_id
  where req.id = p_request_id;

  if v_workspace_id is null then
    raise exception 'information request not found';
  end if;

  if v_send_email or v_send_sms then
    select primary_email, primary_phone into v_primary_email, v_primary_phone
    from public.clients where id = v_client_id;
  end if;

  if v_send_email and v_primary_email is not null then
    insert into public.notification_queue (workspace_id, recipient_email, channel, template_key, payload, entity_type, entity_id, event_type, domain_id)
    values (v_workspace_id, v_primary_email, 'Email', 'organizer-information-request',
      jsonb_build_object('message', p_message), v_entity_type, v_entity_id, 'organizer_information_request', v_domain_id);
  end if;

  if v_send_sms and v_primary_phone is not null then
    insert into public.notification_queue (workspace_id, recipient_phone, channel, template_key, payload, entity_type, entity_id, event_type)
    values (v_workspace_id, v_primary_phone, 'SMS', 'organizer-information-request',
      jsonb_build_object('message', p_message), v_entity_type, v_entity_id, 'organizer_information_request');
  end if;

  if v_show_in_portal then
    select id into v_thread_id from public.message_threads
    where workspace_id = v_workspace_id and entity_type = 'client' and entity_id = v_client_id and status = 'open'
    order by coalesce(last_message_at, created_at) desc
    limit 1;

    if v_thread_id is null then
      insert into public.message_threads (workspace_id, entity_type, entity_id, subject, channel)
      values (v_workspace_id, 'client', v_client_id, 'Information needed on your organizer', 'portal')
      returning id into v_thread_id;
    end if;

    insert into public.messages (workspace_id, thread_id, sender_type, is_internal, body)
    values (v_workspace_id, v_thread_id, 'staff', false, p_message);

    update public.message_threads set last_message_at = now() where id = v_thread_id;
  end if;
end;
$function$;
