-- Live (synchronous) sessions: a course module that's a scheduled Zoom
-- meeting/webinar instead of pre-recorded content. Reuses the existing
-- Zoom OAuth integration (user_zoom_connections) -- the host is whichever
-- staff member's connected Zoom account created the session.
alter table public.learning_modules drop constraint learning_modules_module_type_check;
alter table public.learning_modules add constraint learning_modules_module_type_check
  check (module_type in ('lesson', 'quiz', 'live_session'));

create table public.learning_live_sessions (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null unique references public.learning_modules(id) on delete cascade,
  host_user_id uuid not null references auth.users(id),
  zoom_meeting_id text not null,
  join_url text not null,
  -- Host-only launch link -- never selectable by a plain learner, see RLS below.
  start_url text not null,
  scheduled_start timestamptz not null,
  duration_minutes int not null,
  is_webinar boolean not null default false,
  created_at timestamptz not null default now()
);
create index learning_live_sessions_module_id_idx on public.learning_live_sessions (module_id);

alter table public.learning_live_sessions enable row level security;

-- Everyone with access to the course can see the session's schedule/join
-- info; start_url is filtered out at the application layer for non-managers
-- (mirrors how quiz answer keys are handled -- there's no column-level RLS
-- in Postgres, so the create-route/learner queries simply never select it
-- for a non-manager, and this policy only gates row visibility overall).
create policy learning_live_sessions_select on public.learning_live_sessions
  for select using (
    exists (
      select 1 from public.learning_modules m join public.learning_courses c on c.id = m.course_id
      where m.id = learning_live_sessions.module_id
        and public.has_learning_hub_access(c.owner_workspace_id)
        and (c.status = 'published' or public.is_workspace_member(c.owner_workspace_id))
    )
  );
create policy learning_live_sessions_insert on public.learning_live_sessions
  for insert with check (
    exists (select 1 from public.learning_modules m join public.learning_courses c on c.id = m.course_id where m.id = learning_live_sessions.module_id and public.has_permission(c.owner_workspace_id, 'learning_hub.manage'))
  );
create policy learning_live_sessions_update on public.learning_live_sessions
  for update using (
    exists (select 1 from public.learning_modules m join public.learning_courses c on c.id = m.course_id where m.id = learning_live_sessions.module_id and public.has_permission(c.owner_workspace_id, 'learning_hub.manage'))
  );
create policy learning_live_sessions_delete on public.learning_live_sessions
  for delete using (
    exists (select 1 from public.learning_modules m join public.learning_courses c on c.id = m.course_id where m.id = learning_live_sessions.module_id and public.has_permission(c.owner_workspace_id, 'learning_hub.manage'))
  );

-- Live-session reminder, 1 hour before scheduled_start, to everyone
-- assigned to the owning course. Same shape as every other reminder loop
-- in this function -- appended, not a new mechanism.
create or replace function public.enqueue_reminder_notifications()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    select ps.id as stage_id, pr.workspace_id, pr.entity_id as engagement_id, ps.due_date, ps.stage_name, ps.reviewer_id, u.email, up.phone
    from public.pipeline_stages ps
    join public.pipeline_runs pr on pr.id = ps.pipeline_run_id
    join auth.users u on u.id = ps.reviewer_id
    left join public.user_profiles up on up.id = ps.reviewer_id
    where pr.entity_type = 'engagement'
      and ps.status in ('Pending', 'In Progress', 'Waiting')
      and ps.due_date is not null
      and ps.due_date between now() and now() + interval '2 days'
      and ps.reviewer_id is not null
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

  -- Live session reminders, 1 hour out, to every learner formally assigned
  -- to the owning course. (Staff browsing/self-serving an unassigned course
  -- has no assignment row and so gets no reminder here -- same anchor
  -- limitation as drip-scheduling's offset mode.)
  for r in
    select ls.id, m.id as module_id, c.owner_workspace_id as workspace_id, m.title, ls.scheduled_start, ls.join_url,
           ca.user_id, u.email, up.phone
    from public.learning_live_sessions ls
    join public.learning_modules m on m.id = ls.module_id
    join public.learning_courses c on c.id = m.course_id
    join public.learning_course_assignments ca on ca.course_id = c.id
    join auth.users u on u.id = ca.user_id
    left join public.user_profiles up on up.id = ca.user_id
    where ls.scheduled_start between now() and now() + interval '1 hour'
  loop
    if public.is_notification_enabled(r.user_id, r.workspace_id, 'live_session_reminder', 'Email') then
      insert into public.notification_queue (workspace_id, channel, template_key, event_type, payload, recipient_user_id, recipient_email, dedupe_key, entity_type, entity_id)
      values (r.workspace_id, 'Email', 'live-session-reminder', 'live_session_reminder',
              jsonb_build_object('title', r.title, 'scheduled_start', r.scheduled_start, 'join_url', r.join_url),
              r.user_id, r.email, 'live_session_reminder:' || r.id || ':' || r.user_id, 'learning_module', r.module_id)
      on conflict (workspace_id, template_key, dedupe_key) where dedupe_key is not null do nothing;
      if found then v_count := v_count + 1; end if;
    end if;
    if r.phone is not null and public.is_notification_enabled(r.user_id, r.workspace_id, 'live_session_reminder', 'SMS') then
      insert into public.notification_queue (workspace_id, channel, template_key, event_type, payload, recipient_user_id, recipient_phone, dedupe_key, entity_type, entity_id)
      values (r.workspace_id, 'SMS', 'live-session-reminder-sms', 'live_session_reminder',
              jsonb_build_object('title', r.title, 'scheduled_start', r.scheduled_start, 'join_url', r.join_url),
              r.user_id, r.phone, 'live_session_reminder:' || r.id || ':' || r.user_id, 'learning_module', r.module_id)
      on conflict (workspace_id, template_key, dedupe_key) where dedupe_key is not null do nothing;
      if found then v_count := v_count + 1; end if;
    end if;
  end loop;

  return v_count;
end;
$function$;

insert into public.email_templates (workspace_id, name, slug, category, subject, body_html, merge_fields, status)
values
  (null, 'Live Session Reminder', 'live-session-reminder', 'learning',
   'Starting soon: {{title}}',
   E'Hi,\n\nThis is a reminder that "{{title}}" starts at {{scheduled_start}}.\n\nJoin here: {{join_url}}\n\nSee you there!',
   '["title", "scheduled_start", "join_url"]'::jsonb, 'published');

insert into public.sms_templates (workspace_id, name, slug, body, status)
values
  (null, 'Live Session Reminder (SMS)', 'live-session-reminder-sms',
   'Reminder: "{{title}}" starts at {{scheduled_start}}. Join: {{join_url}}', 'published');
