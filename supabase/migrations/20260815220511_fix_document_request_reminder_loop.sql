-- Corrects the document_requests loop just added to
-- enqueue_reminder_notifications(): the first attempt nested a second
-- `for r in ... loop` inside the outer one, reusing the same `r` variable
-- and never actually inserting anything -- it just iterated and exited.
-- Replaced with a single flat query (same shape as every other loop in
-- this function): entity_type='client' uses entity_id directly,
-- entity_type='engagement' resolves the client through engagements.
create or replace function public.enqueue_reminder_notifications()
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_count int := 0;
  r record;
begin
  for r in
    select i.id, i.workspace_id, i.due_date, i.total_amount, i.amount_paid, i.invoice_number, i.client_id,
           cpu.user_id, u.email, c.primary_phone
    from public.invoices i
    join public.client_portal_users cpu on cpu.client_id = i.client_id and cpu.is_primary = true and cpu.status = 'active'
    join auth.users u on u.id = cpu.user_id
    join public.clients c on c.id = i.client_id
    where i.status not in ('paid', 'void', 'draft')
      and i.amount_paid < i.total_amount
      and i.due_date is not null
      and i.due_date between now() and now() + interval '3 days'
  loop
    if public.is_notification_enabled(r.user_id, r.workspace_id, 'invoice_due', 'Email') then
      insert into public.notification_queue (workspace_id, channel, template_key, event_type, payload, recipient_user_id, recipient_email, dedupe_key, entity_type, entity_id)
      values (r.workspace_id, 'Email', 'invoice-due-reminder', 'invoice_due',
              jsonb_build_object('invoice_number', r.invoice_number, 'due_date', r.due_date, 'amount_due', r.total_amount - r.amount_paid),
              r.user_id, r.email, 'invoice_due:' || r.id, 'client', r.client_id)
      on conflict (workspace_id, template_key, dedupe_key) where dedupe_key is not null do nothing;
      if found then v_count := v_count + 1; end if;
    end if;
    if r.primary_phone is not null and public.is_notification_enabled(r.user_id, r.workspace_id, 'invoice_due', 'SMS') then
      insert into public.notification_queue (workspace_id, channel, template_key, event_type, payload, recipient_user_id, recipient_phone, dedupe_key, entity_type, entity_id)
      values (r.workspace_id, 'SMS', 'invoice-due-reminder-sms', 'invoice_due',
              jsonb_build_object('invoice_number', r.invoice_number, 'due_date', r.due_date, 'amount_due', r.total_amount - r.amount_paid),
              r.user_id, r.primary_phone, 'invoice_due:' || r.id, 'client', r.client_id)
      on conflict (workspace_id, template_key, dedupe_key) where dedupe_key is not null do nothing;
      if found then v_count := v_count + 1; end if;
    end if;
  end loop;

  for r in
    select s.id as signer_id, sr.workspace_id, sr.due_date, sr.title, s.signer_name, s.signer_email
    from public.signature_request_signers s
    join public.signature_requests sr on sr.id = s.signature_request_id
    where s.status = 'pending'
      and sr.status = 'pending'
      and sr.due_date is not null
      and sr.due_date between now() and now() + interval '2 days'
      and s.signer_email is not null
  loop
    insert into public.notification_queue (workspace_id, channel, template_key, event_type, payload, recipient_email, dedupe_key)
    values (r.workspace_id, 'Email', 'signature-due-reminder', 'signature_due',
            jsonb_build_object('signer_name', r.signer_name, 'document_title', r.title, 'due_date', r.due_date),
            r.signer_email, 'signature_due:' || r.signer_id)
    on conflict (workspace_id, template_key, dedupe_key) where dedupe_key is not null do nothing;
    if found then v_count := v_count + 1; end if;
  end loop;

  for r in
    select ws.id as stage_id, wr.workspace_id, wr.engagement_id, ws.due_date, ws.stage_name, ws.reviewer_id, u.email, up.phone
    from public.workflow_stages ws
    join public.workflow_runs wr on wr.id = ws.workflow_run_id
    join auth.users u on u.id = ws.reviewer_id
    left join public.user_profiles up on up.id = ws.reviewer_id
    where ws.status in ('Pending', 'In Progress', 'Waiting')
      and ws.due_date is not null
      and ws.due_date between now() and now() + interval '2 days'
      and ws.reviewer_id is not null
  loop
    if public.is_notification_enabled(r.reviewer_id, r.workspace_id, 'workflow_stage_due', 'Email') then
      insert into public.notification_queue (workspace_id, channel, template_key, event_type, payload, recipient_user_id, recipient_email, dedupe_key, entity_type, entity_id)
      values (r.workspace_id, 'Email', 'workflow-stage-due-reminder', 'workflow_stage_due',
              jsonb_build_object('stage_name', r.stage_name, 'due_date', r.due_date),
              r.reviewer_id, r.email, 'workflow_stage_due:' || r.stage_id, 'engagement', r.engagement_id)
      on conflict (workspace_id, template_key, dedupe_key) where dedupe_key is not null do nothing;
      if found then v_count := v_count + 1; end if;
    end if;
    if r.phone is not null and public.is_notification_enabled(r.reviewer_id, r.workspace_id, 'workflow_stage_due', 'SMS') then
      insert into public.notification_queue (workspace_id, channel, template_key, event_type, payload, recipient_user_id, recipient_phone, dedupe_key, entity_type, entity_id)
      values (r.workspace_id, 'SMS', 'workflow-stage-due-reminder-sms', 'workflow_stage_due',
              jsonb_build_object('stage_name', r.stage_name, 'due_date', r.due_date),
              r.reviewer_id, r.phone, 'workflow_stage_due:' || r.stage_id, 'engagement', r.engagement_id)
      on conflict (workspace_id, template_key, dedupe_key) where dedupe_key is not null do nothing;
      if found then v_count := v_count + 1; end if;
    end if;
  end loop;

  for r in
    select a.id, a.workspace_id, a.title, a.start_at, a.location, a.staff_id, u.email, up.phone
    from public.appointments a
    join auth.users u on u.id = a.staff_id
    left join public.user_profiles up on up.id = a.staff_id
    where a.status in ('scheduled', 'confirmed')
      and a.start_at between now() and now() + interval '1 day'
      and a.staff_id is not null
  loop
    if public.is_notification_enabled(r.staff_id, r.workspace_id, 'appointment_reminder', 'Email') then
      insert into public.notification_queue (workspace_id, channel, template_key, event_type, payload, recipient_user_id, recipient_email, dedupe_key)
      values (r.workspace_id, 'Email', 'appointment-reminder', 'appointment_reminder',
              jsonb_build_object('title', r.title, 'start_at', r.start_at, 'location', coalesce(r.location, 'Not specified')),
              r.staff_id, r.email, 'appointment_staff:' || r.id)
      on conflict (workspace_id, template_key, dedupe_key) where dedupe_key is not null do nothing;
      if found then v_count := v_count + 1; end if;
    end if;
    if r.phone is not null and public.is_notification_enabled(r.staff_id, r.workspace_id, 'appointment_reminder', 'SMS') then
      insert into public.notification_queue (workspace_id, channel, template_key, event_type, payload, recipient_user_id, recipient_phone, dedupe_key)
      values (r.workspace_id, 'SMS', 'appointment-reminder-sms', 'appointment_reminder',
              jsonb_build_object('title', r.title, 'start_at', r.start_at, 'location', coalesce(r.location, 'Not specified')),
              r.staff_id, r.phone, 'appointment_staff:' || r.id)
      on conflict (workspace_id, template_key, dedupe_key) where dedupe_key is not null do nothing;
      if found then v_count := v_count + 1; end if;
    end if;
  end loop;

  for r in
    select a.id, a.workspace_id, a.title, a.start_at, a.location, a.client_id, cpu.user_id, u.email, c.primary_phone
    from public.appointments a
    join public.client_portal_users cpu on cpu.client_id = a.client_id and cpu.is_primary = true and cpu.status = 'active'
    join auth.users u on u.id = cpu.user_id
    join public.clients c on c.id = a.client_id
    where a.status in ('scheduled', 'confirmed')
      and a.portal_visible = true
      and a.client_id is not null
      and a.start_at between now() and now() + interval '1 day'
  loop
    if public.is_notification_enabled(r.user_id, r.workspace_id, 'appointment_reminder', 'Email') then
      insert into public.notification_queue (workspace_id, channel, template_key, event_type, payload, recipient_user_id, recipient_email, dedupe_key)
      values (r.workspace_id, 'Email', 'appointment-reminder', 'appointment_reminder',
              jsonb_build_object('title', r.title, 'start_at', r.start_at, 'location', coalesce(r.location, 'Not specified')),
              r.user_id, r.email, 'appointment_client:' || r.id)
      on conflict (workspace_id, template_key, dedupe_key) where dedupe_key is not null do nothing;
      if found then v_count := v_count + 1; end if;
    end if;
    if r.primary_phone is not null and public.is_notification_enabled(r.user_id, r.workspace_id, 'appointment_reminder', 'SMS') then
      insert into public.notification_queue (workspace_id, channel, template_key, event_type, payload, recipient_user_id, recipient_phone, dedupe_key)
      values (r.workspace_id, 'SMS', 'appointment-reminder-sms', 'appointment_reminder',
              jsonb_build_object('title', r.title, 'start_at', r.start_at, 'location', coalesce(r.location, 'Not specified')),
              r.user_id, r.primary_phone, 'appointment_client:' || r.id)
      on conflict (workspace_id, template_key, dedupe_key) where dedupe_key is not null do nothing;
      if found then v_count := v_count + 1; end if;
    end if;
  end loop;

  for r in
    select i.id, i.workspace_id, i.invoice_number, i.expected_deposit_date, i.payment_method,
           i.total_amount - i.amount_paid as amount_due,
           coalesce(e.assigned_staff_id, admin.user_id) as recipient_user_id,
           u.email, up.phone
    from public.invoices i
    left join public.engagements e on e.id = i.engagement_id
    left join lateral (
      select wu.user_id
      from public.workspace_users wu
      join public.roles ro on ro.id = wu.role_id
      where wu.workspace_id = i.workspace_id
        and wu.status = 'active'
        and (wu.is_owner or ro.slug in ('owner', 'admin'))
      order by wu.is_owner desc, wu.created_at asc
      limit 1
    ) admin on true
    join auth.users u on u.id = coalesce(e.assigned_staff_id, admin.user_id)
    left join public.user_profiles up on up.id = coalesce(e.assigned_staff_id, admin.user_id)
    where i.status not in ('paid', 'void', 'draft')
      and i.expected_deposit_date is not null
      and i.expected_deposit_date <= current_date
  loop
    if public.is_notification_enabled(r.recipient_user_id, r.workspace_id, 'funds_received_reminder', 'Email') then
      insert into public.notification_queue (workspace_id, channel, template_key, event_type, payload, recipient_user_id, recipient_email, dedupe_key)
      values (r.workspace_id, 'Email', 'funds-received-reminder', 'funds_received_reminder',
              jsonb_build_object('invoice_number', r.invoice_number, 'expected_deposit_date', r.expected_deposit_date, 'payment_method', coalesce(r.payment_method, 'N/A'), 'amount_due', r.amount_due),
              r.recipient_user_id, r.email, 'funds_received_reminder:' || r.id)
      on conflict (workspace_id, template_key, dedupe_key) where dedupe_key is not null do nothing;
      if found then v_count := v_count + 1; end if;
    end if;
    if r.phone is not null and public.is_notification_enabled(r.recipient_user_id, r.workspace_id, 'funds_received_reminder', 'SMS') then
      insert into public.notification_queue (workspace_id, channel, template_key, event_type, payload, recipient_user_id, recipient_phone, dedupe_key)
      values (r.workspace_id, 'SMS', 'funds-received-reminder-sms', 'funds_received_reminder',
              jsonb_build_object('invoice_number', r.invoice_number, 'expected_deposit_date', r.expected_deposit_date, 'payment_method', coalesce(r.payment_method, 'N/A'), 'amount_due', r.amount_due),
              r.recipient_user_id, r.phone, 'funds_received_reminder:' || r.id)
      on conflict (workspace_id, template_key, dedupe_key) where dedupe_key is not null do nothing;
      if found then v_count := v_count + 1; end if;
    end if;
  end loop;

  for r in
    select ws.id, ws.workspace_id, ws.current_period_end,
           admin.user_id as recipient_user_id, u.email, up.phone
    from public.workspace_subscriptions ws
    left join lateral (
      select wu.user_id
      from public.workspace_users wu
      join public.roles ro on ro.id = wu.role_id
      where wu.workspace_id = ws.workspace_id
        and wu.status = 'active'
        and (wu.is_owner or ro.slug in ('owner', 'admin'))
      order by wu.is_owner desc, wu.created_at asc
      limit 1
    ) admin on true
    join auth.users u on u.id = admin.user_id
    left join public.user_profiles up on up.id = admin.user_id
    where ws.stripe_status in ('trialing', 'active', 'past_due')
      and ws.current_period_end is not null
      and ws.current_period_end - interval '7 days' between now() and now() + interval '1 day'
  loop
    if public.is_notification_enabled(r.recipient_user_id, r.workspace_id, 'subscription_renewal_reminder', 'Email') then
      insert into public.notification_queue (workspace_id, channel, template_key, event_type, payload, recipient_user_id, recipient_email, dedupe_key)
      values (r.workspace_id, 'Email', 'subscription-renewal-reminder', 'subscription_renewal_reminder',
              jsonb_build_object('renewal_date', r.current_period_end),
              r.recipient_user_id, r.email, 'subscription_renewal_reminder:' || r.id || ':' || r.current_period_end::text)
      on conflict (workspace_id, template_key, dedupe_key) where dedupe_key is not null do nothing;
      if found then v_count := v_count + 1; end if;
    end if;
    if r.phone is not null and public.is_notification_enabled(r.recipient_user_id, r.workspace_id, 'subscription_renewal_reminder', 'SMS') then
      insert into public.notification_queue (workspace_id, channel, template_key, event_type, payload, recipient_user_id, recipient_phone, dedupe_key)
      values (r.workspace_id, 'SMS', 'subscription-renewal-reminder-sms', 'subscription_renewal_reminder',
              jsonb_build_object('renewal_date', r.current_period_end),
              r.recipient_user_id, r.phone, 'subscription_renewal_reminder:' || r.id || ':' || r.current_period_end::text)
      on conflict (workspace_id, template_key, dedupe_key) where dedupe_key is not null do nothing;
      if found then v_count := v_count + 1; end if;
    end if;
  end loop;

  for r in
    select dr.id, dr.workspace_id, dr.title, dr.due_date, cpu.user_id, u.email, c.primary_phone
    from public.document_requests dr
    left join public.engagements e on dr.entity_type = 'engagement' and e.id = dr.entity_id
    join public.client_portal_users cpu
      on cpu.client_id = case when dr.entity_type = 'client' then dr.entity_id else e.client_id end
      and cpu.is_primary = true and cpu.status = 'active'
    join auth.users u on u.id = cpu.user_id
    join public.clients c on c.id = cpu.client_id
    where dr.status = 'open'
      and dr.due_date is not null
      and dr.due_date between now() and now() + interval '2 days'
  loop
    if public.is_notification_enabled(r.user_id, r.workspace_id, 'document_request_due', 'Email') then
      insert into public.notification_queue (workspace_id, channel, template_key, event_type, payload, recipient_user_id, recipient_email, dedupe_key, entity_type, entity_id)
      values (r.workspace_id, 'Email', 'document-request-due-reminder', 'document_request_due',
              jsonb_build_object('title', r.title, 'due_date', r.due_date),
              r.user_id, r.email, 'document_request_due:' || r.id, 'document_request', r.id)
      on conflict (workspace_id, template_key, dedupe_key) where dedupe_key is not null do nothing;
      if found then v_count := v_count + 1; end if;
    end if;
    if r.primary_phone is not null and public.is_notification_enabled(r.user_id, r.workspace_id, 'document_request_due', 'SMS') then
      insert into public.notification_queue (workspace_id, channel, template_key, event_type, payload, recipient_user_id, recipient_phone, dedupe_key, entity_type, entity_id)
      values (r.workspace_id, 'SMS', 'document-request-due-reminder-sms', 'document_request_due',
              jsonb_build_object('title', r.title, 'due_date', r.due_date),
              r.user_id, r.primary_phone, 'document_request_due:' || r.id, 'document_request', r.id)
      on conflict (workspace_id, template_key, dedupe_key) where dedupe_key is not null do nothing;
      if found then v_count := v_count + 1; end if;
    end if;
  end loop;

  return v_count;
end;
$function$;
