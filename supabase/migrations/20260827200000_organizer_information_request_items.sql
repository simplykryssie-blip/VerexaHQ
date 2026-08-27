-- Organizer Information Requests v2: field-scoped items, propose/approve
-- corrections, due date + tags, and a new automation trigger.
--
-- Today organizer_information_requests is a single blob per "send" with no
-- line items, so a reviewer can only flag a question that already has an
-- answer row (see set_organizer_answer_review_status). This migration adds
-- a document_requests-style parent+items structure: a 'draft' request
-- accumulates organizer_information_request_items as the reviewer flags
-- fields (answered or not), then an explicit "send" finalizes it.

-- ---------------------------------------------------------------------
-- organizer_information_requests: add due_date/tags, allow draft status,
-- and relax message to nullable (a draft has no message until it's sent).
-- ---------------------------------------------------------------------
alter table public.organizer_information_requests
  add column due_date date,
  add column tags text[] not null default '{}',
  alter column message drop not null;

alter table public.organizer_information_requests
  drop constraint organizer_information_requests_status_check;
alter table public.organizer_information_requests
  add constraint organizer_information_requests_status_check
  check (status = any (array['draft', 'active', 'viewed', 'responded', 'resolved']));

-- ---------------------------------------------------------------------
-- organizer_information_request_items
-- ---------------------------------------------------------------------
create table public.organizer_information_request_items (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.organizer_information_requests(id) on delete cascade,
  organizer_field_id uuid not null references public.organizer_fields(id) on delete cascade,
  instance_index int not null default 0,
  note text,
  status text not null default 'pending'
    check (status = any (array['pending', 'client_responded', 'approved', 'rejected', 'resolved'])),
  was_answered_when_flagged boolean not null,
  proposed_value jsonb,
  decision_note text,
  resolved_by uuid references auth.users(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

-- One open flag per field/instance at a time; once terminal, a fresh flag
-- can be raised again (new row) without conflicting with the closed one.
create unique index organizer_information_request_items_open_unique
  on public.organizer_information_request_items (request_id, organizer_field_id, instance_index)
  where status not in ('resolved', 'approved', 'rejected');

create index organizer_information_request_items_request_id_idx
  on public.organizer_information_request_items (request_id);

alter table public.organizer_information_request_items enable row level security;

-- Writes only ever happen through the SECURITY DEFINER RPCs below, matching
-- this app's established convention -- no raw INSERT/UPDATE/DELETE policies.
create policy organizer_information_request_items_select
  on public.organizer_information_request_items for select
  using (
    exists (
      select 1 from public.organizer_information_requests req
      join public.organizer_responses r on r.id = req.organizer_response_id
      where req.id = organizer_information_request_items.request_id
        and (public.has_permission(req.workspace_id, 'organizers.review') or public.is_portal_user(r.client_id))
    )
  );

-- ---------------------------------------------------------------------
-- Auto-resolve the parent request once every item under it is terminal.
-- This is also the exact point the new automation trigger fires from.
-- ---------------------------------------------------------------------
create or replace function public.resolve_organizer_information_request_if_done()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_open_count int;
begin
  select count(*) into v_open_count
  from public.organizer_information_request_items
  where request_id = new.request_id
    and status not in ('resolved', 'approved', 'rejected');

  if v_open_count = 0 then
    update public.organizer_information_requests
    set status = 'resolved', resolved_at = now()
    where id = new.request_id and status <> 'resolved';
  end if;

  return new;
end;
$$;

create trigger trg_resolve_organizer_information_request_if_done
  after update of status on public.organizer_information_request_items
  for each row execute function public.resolve_organizer_information_request_if_done();

-- ---------------------------------------------------------------------
-- Shared notification fan-out, factored out of create_organizer_information_request
-- so send_organizer_information_request and reject_organizer_information_request_item
-- both reuse the exact same email/SMS/portal-message paths.
-- ---------------------------------------------------------------------
create or replace function public.notify_organizer_information_request(
  p_request_id uuid,
  p_message text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
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
begin
  select req.workspace_id, r.client_id, req.sent_via_email, req.sent_via_sms, req.shown_in_portal,
    case when r.engagement_id is not null then 'engagement' else 'client' end, coalesce(r.engagement_id, r.client_id)
  into v_workspace_id, v_client_id, v_send_email, v_send_sms, v_show_in_portal, v_entity_type, v_entity_id
  from public.organizer_information_requests req
  join public.organizer_responses r on r.id = req.organizer_response_id
  where req.id = p_request_id;

  if v_workspace_id is null then
    raise exception 'information request not found';
  end if;

  if v_send_email or v_send_sms then
    select primary_email, primary_phone into v_primary_email, v_primary_phone
    from public.clients where id = v_client_id;
  end if;

  if v_send_email and v_primary_email is not null then
    insert into public.notification_queue (workspace_id, recipient_email, channel, template_key, payload, entity_type, entity_id, event_type)
    values (v_workspace_id, v_primary_email, 'Email', 'organizer-information-request',
      jsonb_build_object('message', p_message), v_entity_type, v_entity_id, 'organizer_information_request');
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
$$;

-- ---------------------------------------------------------------------
-- flag_organizer_field_for_info: field-scoped, no answer required.
-- ---------------------------------------------------------------------
create or replace function public.flag_organizer_field_for_info(
  p_organizer_response_id uuid,
  p_organizer_field_id uuid,
  p_instance_index int default 0,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_request_id uuid;
  v_item_id uuid;
  v_has_answer boolean;
begin
  select workspace_id into v_workspace_id
  from public.organizer_responses where id = p_organizer_response_id;

  if v_workspace_id is null then
    raise exception 'organizer response not found';
  end if;
  if not public.has_permission(v_workspace_id, 'organizers.review') then
    raise exception 'insufficient permissions';
  end if;

  select id into v_request_id
  from public.organizer_information_requests
  where organizer_response_id = p_organizer_response_id and status = 'draft'
  limit 1;

  if v_request_id is null then
    insert into public.organizer_information_requests (workspace_id, organizer_response_id, created_by, status)
    values (v_workspace_id, p_organizer_response_id, auth.uid(), 'draft')
    returning id into v_request_id;
  end if;

  select id into v_item_id
  from public.organizer_information_request_items
  where request_id = v_request_id
    and organizer_field_id = p_organizer_field_id
    and instance_index = p_instance_index
    and status not in ('resolved', 'approved', 'rejected');

  if v_item_id is not null then
    update public.organizer_information_request_items
    set note = p_note
    where id = v_item_id;
    return v_item_id;
  end if;

  select exists (
    select 1 from public.organizer_response_answers
    where organizer_response_id = p_organizer_response_id
      and organizer_field_id = p_organizer_field_id
      and instance_index = p_instance_index
      and value is not null and value not in ('null'::jsonb, '""'::jsonb)
  ) into v_has_answer;

  insert into public.organizer_information_request_items
    (request_id, organizer_field_id, instance_index, note, was_answered_when_flagged)
  values (v_request_id, p_organizer_field_id, p_instance_index, p_note, v_has_answer)
  returning id into v_item_id;

  return v_item_id;
end;
$$;

-- ---------------------------------------------------------------------
-- unflag_organizer_information_request_item
-- ---------------------------------------------------------------------
create or replace function public.unflag_organizer_information_request_item(
  p_item_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_request_id uuid;
  v_request_status text;
begin
  select req.workspace_id, req.id, req.status
  into v_workspace_id, v_request_id, v_request_status
  from public.organizer_information_request_items item
  join public.organizer_information_requests req on req.id = item.request_id
  where item.id = p_item_id;

  if v_workspace_id is null then
    raise exception 'information request item not found';
  end if;
  if not public.has_permission(v_workspace_id, 'organizers.review') then
    raise exception 'insufficient permissions';
  end if;

  if v_request_status = 'draft' then
    delete from public.organizer_information_request_items where id = p_item_id;

    if not exists (select 1 from public.organizer_information_request_items where request_id = v_request_id) then
      delete from public.organizer_information_requests where id = v_request_id and status = 'draft';
    end if;
  else
    update public.organizer_information_request_items
    set status = 'resolved', resolved_by = auth.uid(), resolved_at = now()
    where id = p_item_id;
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- send_organizer_information_request: finalizes a draft.
-- ---------------------------------------------------------------------
create or replace function public.send_organizer_information_request(
  p_request_id uuid,
  p_message text,
  p_due_date date default null,
  p_tags text[] default '{}',
  p_send_email boolean default false,
  p_send_sms boolean default false,
  p_show_in_portal boolean default true
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_response_id uuid;
  v_entity_type text;
  v_entity_id uuid;
  v_engagement_id uuid;
  v_client_id uuid;
begin
  select req.workspace_id, req.organizer_response_id
  into v_workspace_id, v_response_id
  from public.organizer_information_requests req
  where req.id = p_request_id and req.status = 'draft';

  if v_workspace_id is null then
    raise exception 'draft information request not found';
  end if;
  if not public.has_permission(v_workspace_id, 'organizers.review') then
    raise exception 'insufficient permissions';
  end if;
  if nullif(btrim(p_message), '') is null then
    raise exception 'a message is required';
  end if;
  if not exists (select 1 from public.organizer_information_request_items where request_id = p_request_id) then
    raise exception 'add at least one item before sending';
  end if;

  select client_id, engagement_id into v_client_id, v_engagement_id
  from public.organizer_responses where id = v_response_id;
  v_entity_type := case when v_engagement_id is not null then 'engagement' else 'client' end;
  v_entity_id := coalesce(v_engagement_id, v_client_id);

  update public.organizer_information_requests
  set status = 'active', message = p_message, due_date = p_due_date, tags = coalesce(p_tags, '{}'),
    sent_via_email = p_send_email, sent_via_sms = p_send_sms, shown_in_portal = p_show_in_portal
  where id = p_request_id;

  perform public.set_organizer_response_review_status(v_response_id, 'Corrections Requested', p_message);
  perform public.notify_organizer_information_request(p_request_id, p_message);

  insert into public.activity_log (workspace_id, actor_id, entity_type, entity_id, activity_type, event_type, description, metadata)
  values (v_workspace_id, auth.uid(), v_entity_type, v_entity_id, 'ORGANIZER_INFO_REQUESTED', 'ORGANIZER_INFO_REQUESTED',
    'Requested information on an organizer', jsonb_build_object('request_id', p_request_id, 'response_id', v_response_id));
end;
$$;

-- ---------------------------------------------------------------------
-- save_organizer_reopened_field_answer: client fills in a field that was
-- never answered. Bypasses the RLS window (which only allows client writes
-- while status is not_started/in_progress) because the response may already
-- be submitted/reviewed by the time this fires.
-- ---------------------------------------------------------------------
create or replace function public.save_organizer_reopened_field_answer(
  p_item_id uuid,
  p_value jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_id uuid;
  v_response_id uuid;
  v_field_id uuid;
  v_instance_index int;
  v_status text;
  v_was_answered boolean;
begin
  select r.client_id, req.organizer_response_id, item.organizer_field_id, item.instance_index, item.status, item.was_answered_when_flagged
  into v_client_id, v_response_id, v_field_id, v_instance_index, v_status, v_was_answered
  from public.organizer_information_request_items item
  join public.organizer_information_requests req on req.id = item.request_id
  join public.organizer_responses r on r.id = req.organizer_response_id
  where item.id = p_item_id;

  if v_client_id is null then
    raise exception 'information request item not found';
  end if;
  if not public.is_portal_user(v_client_id) then
    raise exception 'insufficient permissions';
  end if;
  if v_was_answered then
    raise exception 'this question already has an answer -- propose a correction instead';
  end if;
  if v_status not in ('pending', 'client_responded') then
    raise exception 'this item is no longer open';
  end if;

  insert into public.organizer_response_answers (organizer_response_id, organizer_field_id, instance_index, value)
  values (v_response_id, v_field_id, v_instance_index, p_value)
  on conflict (organizer_response_id, organizer_field_id, instance_index)
  do update set value = excluded.value, updated_at = now();

  update public.organizer_information_request_items
  set status = 'resolved', resolved_at = now()
  where id = p_item_id;
end;
$$;

-- ---------------------------------------------------------------------
-- propose_organizer_answer_correction: client proposes a change to an
-- already-answered, flagged question. Never touches organizer_response_answers.
-- ---------------------------------------------------------------------
create or replace function public.propose_organizer_answer_correction(
  p_item_id uuid,
  p_proposed_value jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_id uuid;
  v_request_id uuid;
  v_status text;
  v_was_answered boolean;
begin
  select r.client_id, item.request_id, item.status, item.was_answered_when_flagged
  into v_client_id, v_request_id, v_status, v_was_answered
  from public.organizer_information_request_items item
  join public.organizer_information_requests req on req.id = item.request_id
  join public.organizer_responses r on r.id = req.organizer_response_id
  where item.id = p_item_id;

  if v_client_id is null then
    raise exception 'information request item not found';
  end if;
  if not public.is_portal_user(v_client_id) then
    raise exception 'insufficient permissions';
  end if;
  if not v_was_answered then
    raise exception 'this question was unanswered -- save an answer instead';
  end if;
  if v_status not in ('pending', 'rejected') then
    raise exception 'this item is not awaiting a response';
  end if;

  update public.organizer_information_request_items
  set proposed_value = p_proposed_value, status = 'client_responded'
  where id = p_item_id;

  update public.organizer_information_requests
  set status = 'responded', responded_at = coalesce(responded_at, now())
  where id = v_request_id and status in ('active', 'viewed');
end;
$$;

-- ---------------------------------------------------------------------
-- approve_organizer_information_request_item: staff applies the proposed
-- correction into the real answer and clears the flag.
-- ---------------------------------------------------------------------
create or replace function public.approve_organizer_information_request_item(
  p_item_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_response_id uuid;
  v_field_id uuid;
  v_instance_index int;
  v_status text;
  v_was_answered boolean;
  v_proposed_value jsonb;
begin
  select req.workspace_id, req.organizer_response_id, item.organizer_field_id, item.instance_index, item.status, item.was_answered_when_flagged, item.proposed_value
  into v_workspace_id, v_response_id, v_field_id, v_instance_index, v_status, v_was_answered, v_proposed_value
  from public.organizer_information_request_items item
  join public.organizer_information_requests req on req.id = item.request_id
  where item.id = p_item_id;

  if v_workspace_id is null then
    raise exception 'information request item not found';
  end if;
  if not public.has_permission(v_workspace_id, 'organizers.review') then
    raise exception 'insufficient permissions';
  end if;
  if not v_was_answered or v_status <> 'client_responded' or v_proposed_value is null then
    raise exception 'this item has no pending correction to approve';
  end if;

  insert into public.organizer_response_answers (organizer_response_id, organizer_field_id, instance_index, value)
  values (v_response_id, v_field_id, v_instance_index, v_proposed_value)
  on conflict (organizer_response_id, organizer_field_id, instance_index)
  do update set value = excluded.value, updated_at = now();

  update public.organizer_information_request_items
  set status = 'approved', resolved_by = auth.uid(), resolved_at = now()
  where id = p_item_id;
end;
$$;

-- ---------------------------------------------------------------------
-- reject_organizer_information_request_item: preserves the original
-- answer, records why, and notifies the client.
-- ---------------------------------------------------------------------
create or replace function public.reject_organizer_information_request_item(
  p_item_id uuid,
  p_decision_note text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_request_id uuid;
  v_status text;
  v_was_answered boolean;
begin
  select req.workspace_id, item.request_id, item.status, item.was_answered_when_flagged
  into v_workspace_id, v_request_id, v_status, v_was_answered
  from public.organizer_information_request_items item
  join public.organizer_information_requests req on req.id = item.request_id
  where item.id = p_item_id;

  if v_workspace_id is null then
    raise exception 'information request item not found';
  end if;
  if not public.has_permission(v_workspace_id, 'organizers.review') then
    raise exception 'insufficient permissions';
  end if;
  if not v_was_answered or v_status <> 'client_responded' then
    raise exception 'this item has no pending correction to reject';
  end if;
  if nullif(btrim(p_decision_note), '') is null then
    raise exception 'a reason is required';
  end if;

  update public.organizer_information_request_items
  set status = 'rejected', decision_note = p_decision_note, resolved_by = auth.uid(), resolved_at = now()
  where id = p_item_id;

  perform public.notify_organizer_information_request(v_request_id, 'One of your submitted corrections was not accepted: ' || p_decision_note);
end;
$$;

-- ---------------------------------------------------------------------
-- New automation trigger: organizer_information_request.resolved
-- ---------------------------------------------------------------------
create or replace function public.fire_organizer_information_request_resolved_automations()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_automation record;
  v_context jsonb;
  v_run_id uuid;
  v_workspace_id uuid;
  v_client_id uuid;
  v_engagement_id uuid;
  v_organizer_template_id uuid;
  v_resolution text;
begin
  if new.status <> 'resolved' or old.status is not distinct from 'resolved' then
    return new;
  end if;

  select r.workspace_id, r.client_id, r.engagement_id, r.organizer_template_id
  into v_workspace_id, v_client_id, v_engagement_id, v_organizer_template_id
  from public.organizer_responses r
  where r.id = new.organizer_response_id;

  if v_workspace_id is null then
    return new;
  end if;

  select case
    when exists (select 1 from public.organizer_information_request_items where request_id = new.id and status = 'rejected') then 'rejected'
    when exists (select 1 from public.organizer_information_request_items where request_id = new.id and status = 'approved') then 'approved'
    else 'completed'
  end into v_resolution;

  v_context := jsonb_build_object(
    'organizer_template_id', v_organizer_template_id,
    'organizer_response_id', new.organizer_response_id,
    'request_id', new.id,
    'resolution', v_resolution
  );

  for v_automation in
    select * from public.automations
    where workspace_id = v_workspace_id and is_enabled = true and status = 'published'
      and trigger_type = 'organizer_information_request.resolved'
      and (
        nullif(trigger_config ->> 'organizer_template_id', '') is null
        or trigger_config ->> 'organizer_template_id' = v_organizer_template_id::text
      )
  loop
    if public.evaluate_automation_conditions(v_automation.conditions, v_context, v_workspace_id, v_client_id, v_engagement_id) then
      insert into public.automation_runs (workspace_id, automation_id, engagement_id, client_id, trigger_snapshot, status)
      values (v_workspace_id, v_automation.id, v_engagement_id, v_client_id, v_context, 'running')
      returning id into v_run_id;
      perform public.start_next_automation_step(v_run_id);
    end if;
  end loop;

  return new;
end;
$$;

create trigger trg_fire_organizer_information_request_resolved_automations
  after update of status on public.organizer_information_requests
  for each row execute function public.fire_organizer_information_request_resolved_automations();
