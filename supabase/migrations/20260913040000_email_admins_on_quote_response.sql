-- Quote accepted/declined only ever notified admins In-App -- no email, so
-- staff who don't have the app open never hear about it. Adds a real,
-- opt-out email alongside the existing bell notification, same
-- notification_queue + global email_templates pattern as every other
-- reminder-style email in the app.
create or replace function public._notify_admins_of_quote_response(p_workspace_id uuid, p_client_id uuid, p_quote_id uuid, p_response text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_recipient record;
  v_client_name text;
  v_quote record;
  v_event_type text := case when p_response = 'accepted' then 'quote_accepted' else 'quote_declined' end;
  v_template_key text := case when p_response = 'accepted' then 'quote-accepted-staff-notification' else 'quote-declined-staff-notification' end;
begin
  select coalesce(business_name, trim(coalesce(first_name, '') || ' ' || coalesce(last_name, ''))) into v_client_name
  from public.clients where id = p_client_id;

  select quote_number, title, total_amount into v_quote from public.quotes where id = p_quote_id;

  for v_recipient in
    select wu.user_id, u.email from public.workspace_users wu
    join public.roles r on r.id = wu.role_id
    join auth.users u on u.id = wu.user_id
    where wu.workspace_id = p_workspace_id and wu.status = 'active'
      and (wu.is_owner or r.slug in ('owner', 'admin'))
  loop
    perform public.create_notification(
      p_workspace_id, v_recipient.user_id,
      case when p_response = 'accepted' then 'QUOTE_ACCEPTED' else 'QUOTE_DECLINED' end,
      case when p_response = 'accepted' then 'quote_accepted' else 'quote_declined' end,
      jsonb_build_object('client_id', p_client_id, 'quote_id', p_quote_id),
      array['In-App'::text], 'Medium', 'quote', p_quote_id
    );

    if public.is_notification_enabled(v_recipient.user_id, p_workspace_id, v_event_type, 'Email') then
      insert into public.notification_queue (workspace_id, channel, template_key, event_type, payload, recipient_user_id, recipient_email, entity_type, entity_id)
      values (
        p_workspace_id, 'Email', v_template_key, v_event_type,
        jsonb_build_object(
          'client_name', coalesce(v_client_name, 'A client'),
          'quote_number', coalesce(v_quote.quote_number, ''),
          'title', coalesce(v_quote.title, ''),
          'total_amount', to_char(coalesce(v_quote.total_amount, 0), 'FM999,999,990.00')
        ),
        v_recipient.user_id, v_recipient.email, 'quote', p_quote_id
      );
    end if;
  end loop;
end;
$$;

insert into public.email_templates (workspace_id, name, slug, category, subject, body_html, merge_fields, status)
values
  (null, 'Quote Accepted (Staff)', 'quote-accepted-staff-notification', 'billing',
   '{{client_name}} accepted quote {{quote_number}}',
   E'Hi,\n\n{{client_name}} just accepted quote {{quote_number}} ("{{title}}") for ${{total_amount}}. It has been automatically turned into an invoice.\n\nLog in to Verexa to review it.\n\nThank you.',
   '["client_name", "quote_number", "title", "total_amount"]'::jsonb, 'published'),
  (null, 'Quote Declined (Staff)', 'quote-declined-staff-notification', 'billing',
   '{{client_name}} declined quote {{quote_number}}',
   E'Hi,\n\n{{client_name}} declined quote {{quote_number}} ("{{title}}") for ${{total_amount}}.\n\nLog in to Verexa to review it.\n\nThank you.',
   '["client_name", "quote_number", "title", "total_amount"]'::jsonb, 'published')
on conflict do nothing;
