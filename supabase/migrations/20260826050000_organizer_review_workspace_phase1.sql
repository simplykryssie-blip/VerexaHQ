-- Organizer Review Workspace, Phase 1 (backend only -- no UI in this
-- migration). Builds on the existing organizer engine untouched
-- (organizer_templates/organizer_fields/conditional_logic/organizer_responses/
-- organizer_response_answers all keep their current shape); this adds only
-- the pieces confirmed genuinely missing after inspecting the live schema,
-- RLS, and automation-firing logic directly (not just migration files --
-- the base organizer tables predate this repo's migration history):
--   1. Per-answer review state (today only the whole response has one).
--   2. A real, trackable information-request object (today "Needs Info" is
--      a window.prompt() into one free-text column with no lifecycle and,
--      critically, no client notification at all).
--   3. A dedicated organizers.review permission (today gated on the coarse
--      clients.edit, inconsistently with the RLS policies which actually
--      check engagements.manage).
--   4. Reviewer assignment + an audit trail (neither exists today).
--   5. A real correctness bug fix: fire_organizer_submitted_automations()
--      re-fires every organizer.submitted automation a second time whenever
--      staff record ANY review decision, because set_organizer_response_review_status
--      force-sets status='reviewed' as a side effect and the trigger treats
--      that as a new submission.

-- 1. Permission: organizers.review, rolled out to exactly the same roles
-- that already got the equivalent engagements.review permission (Owner,
-- Admin, ERO, and the existing system "Reviewer" role) -- these are shared
-- global role rows (not per-workspace copies), so this grants it across
-- every workspace immediately, matching how engagements.review shipped.
insert into public.permissions (key, category, description)
values ('organizers.review', 'organizers', 'Review submitted organizers: approve, request corrections, request documents')
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.workspace_id is null
  and r.slug in ('owner', 'admin', 'ero', 'reviewer')
  and p.key = 'organizers.review'
on conflict do nothing;

-- 2. Per-answer review state -- reuses the existing shared review_status
-- enum (Pending/In Review/Approved/Rejected/Corrections Requested), the
-- same vocabulary already used on organizer_responses and engagements, so
-- no new type. Null means "not yet reviewed" for an answered field; an
-- *unanswered* field (no row here at all) or a conditionally-hidden one is
-- distinguished at render time (no schema needed for those two states).
alter table public.organizer_response_answers
  add column review_status public.review_status,
  add column review_note text;

-- 3. Reviewer assignment -- same shape as engagements.assigned_staff_id.
alter table public.organizer_responses
  add column assigned_reviewer_id uuid references auth.users(id);

-- 4. Internal notes on an organizer response reuse the general notes
-- table (entity_type/entity_id polymorphic pattern already used for
-- client/engagement/task/etc notes) rather than a new notes table --
-- just needs 'organizer_response' added to the allowed entity_type list.
alter table public.notes drop constraint client_notes_entity_type_check;
alter table public.notes add constraint client_notes_entity_type_check
  check (entity_type = any (array['client', 'engagement', 'task', 'document', 'invoice', 'blueprint', 'workflow', 'organizer_response']));

-- 5. The one genuinely new table: a trackable information request, so a
-- "Needs Info" ask survives after the modal closes and has a real
-- lifecycle (active -> viewed -> responded -> resolved) instead of
-- disappearing into a single free-text column. organizer_field_id is
-- nullable -- null means the request is about the whole organizer, not one
-- specific question.
create table public.organizer_information_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  organizer_response_id uuid not null references public.organizer_responses(id) on delete cascade,
  organizer_field_id uuid references public.organizer_fields(id),
  created_by uuid references auth.users(id),
  message text not null,
  status text not null default 'active' check (status in ('active', 'viewed', 'responded', 'resolved')),
  sent_via_email boolean not null default false,
  sent_via_sms boolean not null default false,
  shown_in_portal boolean not null default true,
  created_at timestamptz not null default now(),
  viewed_at timestamptz,
  responded_at timestamptz,
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id)
);
create index organizer_information_requests_response_id_idx on public.organizer_information_requests(organizer_response_id);

alter table public.organizer_information_requests enable row level security;

-- Staff access is gated on the new permission via these SELECT policies;
-- all writes go through the SECURITY DEFINER RPCs below instead of raw
-- table policies, matching how reveal_organizer_answer and the
-- client_pending_changes RPCs already do their own internal permission
-- checks rather than relying on INSERT/UPDATE policies.
create policy organizer_information_requests_select on public.organizer_information_requests
  for select using (
    public.has_permission(workspace_id, 'organizers.review')
    or exists (
      select 1 from public.organizer_responses r
      where r.id = organizer_information_requests.organizer_response_id
        and public.is_portal_user(r.client_id)
    )
  );

-- 6. set_organizer_response_review_status: switch its permission gate from
-- the coarse clients.edit to the new organizers.review, matching the
-- Permission decision for this feature. Logic otherwise unchanged.
create or replace function public.set_organizer_response_review_status(p_response_id uuid, p_status review_status, p_note text default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_workspace_id uuid;
  v_status text;
begin
  select workspace_id, status into v_workspace_id, v_status
  from public.organizer_responses where id = p_response_id;

  if v_workspace_id is null then
    raise exception 'organizer response not found';
  end if;
  if not public.has_permission(v_workspace_id, 'organizers.review') then
    raise exception 'insufficient permissions';
  end if;
  if v_status not in ('submitted', 'reviewed') then
    raise exception 'this organizer has not been submitted yet';
  end if;

  update public.organizer_responses
  set review_status = p_status,
      review_note = p_note,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      status = 'reviewed'
  where id = p_response_id;
end;
$function$;

-- 7. Per-answer review status setter -- the missing counterpart to
-- set_organizer_response_review_status, scoped to one answer instead of
-- the whole response.
create or replace function public.set_organizer_answer_review_status(p_answer_id uuid, p_status review_status, p_note text default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_workspace_id uuid;
  v_entity_type text;
  v_entity_id uuid;
begin
  select r.workspace_id, case when r.engagement_id is not null then 'engagement' else 'client' end, coalesce(r.engagement_id, r.client_id)
  into v_workspace_id, v_entity_type, v_entity_id
  from public.organizer_response_answers a
  join public.organizer_responses r on r.id = a.organizer_response_id
  where a.id = p_answer_id;

  if v_workspace_id is null then
    raise exception 'organizer answer not found';
  end if;
  if not public.has_permission(v_workspace_id, 'organizers.review') then
    raise exception 'insufficient permissions';
  end if;

  update public.organizer_response_answers
  set review_status = p_status, review_note = p_note
  where id = p_answer_id;

  insert into public.activity_log (workspace_id, actor_id, entity_type, entity_id, activity_type, event_type, description, metadata)
  values (v_workspace_id, auth.uid(), v_entity_type, v_entity_id, 'ORGANIZER_ANSWER_REVIEWED', 'ORGANIZER_ANSWER_REVIEWED',
    'Marked an organizer answer "' || p_status || '"', jsonb_build_object('answer_id', p_answer_id));
end;
$function$;

-- 8. Information-request lifecycle RPCs. create_organizer_information_request
-- does the real work: inserts the trackable request row, sets the parent
-- response's review_status to "Corrections Requested" via the existing RPC
-- (one source of truth for that transition, not duplicated logic), and --
-- the actual gap this whole table exists to close -- sends the request
-- through the *existing* notification paths only: notification_queue for
-- email/SMS (same shape execute_automation_step's send_email/send_sms
-- already use) and message_threads/messages for the portal (same shape the
-- send_portal_message automation action already uses). No new send
-- mechanism.
create or replace function public.create_organizer_information_request(
  p_response_id uuid,
  p_message text,
  p_organizer_field_id uuid default null,
  p_send_email boolean default false,
  p_send_sms boolean default false,
  p_show_in_portal boolean default true
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_workspace_id uuid;
  v_client_id uuid;
  v_engagement_id uuid;
  v_entity_type text;
  v_entity_id uuid;
  v_primary_email text;
  v_primary_phone text;
  v_request_id uuid;
  v_thread_id uuid;
begin
  select workspace_id, client_id, engagement_id into v_workspace_id, v_client_id, v_engagement_id
  from public.organizer_responses where id = p_response_id;

  if v_workspace_id is null then
    raise exception 'organizer response not found';
  end if;
  if not public.has_permission(v_workspace_id, 'organizers.review') then
    raise exception 'insufficient permissions';
  end if;
  if nullif(btrim(p_message), '') is null then
    raise exception 'a message is required';
  end if;

  v_entity_type := case when v_engagement_id is not null then 'engagement' else 'client' end;
  v_entity_id := coalesce(v_engagement_id, v_client_id);

  insert into public.organizer_information_requests
    (workspace_id, organizer_response_id, organizer_field_id, created_by, message, sent_via_email, sent_via_sms, shown_in_portal)
  values (v_workspace_id, p_response_id, p_organizer_field_id, auth.uid(), p_message, p_send_email, p_send_sms, p_show_in_portal)
  returning id into v_request_id;

  perform public.set_organizer_response_review_status(p_response_id, 'Corrections Requested', p_message);

  if p_send_email or p_send_sms then
    select primary_email, primary_phone into v_primary_email, v_primary_phone
    from public.clients where id = v_client_id;
  end if;

  if p_send_email and v_primary_email is not null then
    insert into public.notification_queue (workspace_id, recipient_email, channel, template_key, payload, entity_type, entity_id, event_type)
    values (v_workspace_id, v_primary_email, 'Email', 'organizer-information-request',
      jsonb_build_object('message', p_message), v_entity_type, v_entity_id, 'organizer_information_request');
  end if;

  if p_send_sms and v_primary_phone is not null then
    insert into public.notification_queue (workspace_id, recipient_phone, channel, template_key, payload, entity_type, entity_id, event_type)
    values (v_workspace_id, v_primary_phone, 'SMS', 'organizer-information-request',
      jsonb_build_object('message', p_message), v_entity_type, v_entity_id, 'organizer_information_request');
  end if;

  if p_show_in_portal then
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

  insert into public.activity_log (workspace_id, actor_id, entity_type, entity_id, activity_type, event_type, description, metadata)
  values (v_workspace_id, auth.uid(), v_entity_type, v_entity_id, 'ORGANIZER_INFO_REQUESTED', 'ORGANIZER_INFO_REQUESTED',
    'Requested information on an organizer', jsonb_build_object('request_id', v_request_id, 'response_id', p_response_id));

  return v_request_id;
end;
$function$;

create or replace function public.mark_organizer_information_request_viewed(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_client_id uuid;
begin
  select r.client_id into v_client_id
  from public.organizer_information_requests req
  join public.organizer_responses r on r.id = req.organizer_response_id
  where req.id = p_request_id;

  if v_client_id is null then
    raise exception 'information request not found';
  end if;
  if not public.is_portal_user(v_client_id) then
    raise exception 'insufficient permissions';
  end if;

  update public.organizer_information_requests
  set status = 'viewed', viewed_at = coalesce(viewed_at, now())
  where id = p_request_id and status = 'active';
end;
$function$;

create or replace function public.mark_organizer_information_request_responded(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_workspace_id uuid;
begin
  select workspace_id into v_workspace_id from public.organizer_information_requests where id = p_request_id;
  if v_workspace_id is null then
    raise exception 'information request not found';
  end if;
  if not public.has_permission(v_workspace_id, 'organizers.review') then
    raise exception 'insufficient permissions';
  end if;

  update public.organizer_information_requests
  set status = 'responded', responded_at = now()
  where id = p_request_id;
end;
$function$;

create or replace function public.resolve_organizer_information_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_workspace_id uuid;
  v_response_id uuid;
  v_client_id uuid;
  v_engagement_id uuid;
  v_entity_type text;
  v_entity_id uuid;
begin
  select req.workspace_id, req.organizer_response_id, r.client_id, r.engagement_id
  into v_workspace_id, v_response_id, v_client_id, v_engagement_id
  from public.organizer_information_requests req
  join public.organizer_responses r on r.id = req.organizer_response_id
  where req.id = p_request_id;

  if v_workspace_id is null then
    raise exception 'information request not found';
  end if;
  if not public.has_permission(v_workspace_id, 'organizers.review') then
    raise exception 'insufficient permissions';
  end if;

  update public.organizer_information_requests
  set status = 'resolved', resolved_at = now(), resolved_by = auth.uid()
  where id = p_request_id;

  v_entity_type := case when v_engagement_id is not null then 'engagement' else 'client' end;
  v_entity_id := coalesce(v_engagement_id, v_client_id);

  insert into public.activity_log (workspace_id, actor_id, entity_type, entity_id, activity_type, event_type, description, metadata)
  values (v_workspace_id, auth.uid(), v_entity_type, v_entity_id, 'ORGANIZER_INFO_RESOLVED', 'ORGANIZER_INFO_RESOLVED',
    'Resolved an organizer information request', jsonb_build_object('request_id', p_request_id, 'response_id', v_response_id));
end;
$function$;

-- 9. Audit trail for organizer submission/review -- none existed at all.
-- Same activity_log-insert pattern as record_attachment_activity(), scoped
-- to the response's client/engagement (so it surfaces in that existing
-- Timeline tab for free, same convention record_attachment_activity uses).
create or replace function public.record_organizer_response_activity()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_entity_type text;
  v_entity_id uuid;
  v_verb text;
begin
  v_entity_type := case when new.engagement_id is not null then 'engagement' else 'client' end;
  v_entity_id := coalesce(new.engagement_id, new.client_id);

  v_verb := case
    when TG_OP = 'INSERT' and new.status = 'submitted' then 'Submitted'
    when TG_OP = 'UPDATE' and new.status = 'submitted' and old.status is distinct from 'submitted' then 'Submitted'
    when TG_OP = 'UPDATE' and new.review_status is distinct from old.review_status and new.review_status is not null then 'Reviewed'
    else null
  end;

  if v_verb is null then
    return new;
  end if;

  insert into public.activity_log (workspace_id, actor_id, entity_type, entity_id, activity_type, event_type, description, metadata)
  values (
    new.workspace_id, auth.uid(), v_entity_type, v_entity_id,
    'ORGANIZER_' || upper(v_verb), 'ORGANIZER_' || upper(v_verb),
    case when v_verb = 'Reviewed' then 'Organizer marked "' || new.review_status || '"' else 'Organizer submitted' end,
    jsonb_build_object('response_id', new.id)
  );
  return new;
end;
$function$;

drop trigger if exists trg_record_organizer_response_activity on public.organizer_responses;
create trigger trg_record_organizer_response_activity
  after insert or update on public.organizer_responses
  for each row execute function public.record_organizer_response_activity();

-- 10. Real correctness bug fix, found while inspecting this exact trigger
-- for the audit-trail work above: fire_organizer_submitted_automations()
-- fires on NEW.status in ('submitted','reviewed'), but
-- set_organizer_response_review_status() force-sets status='reviewed' as a
-- side effect of ANY review decision -- so approving/denying/requesting
-- corrections on an organizer today silently re-fires every enabled
-- organizer.submitted automation a second time (double welcome email,
-- double document request, etc). Fixed by only ever firing on a genuine
-- transition into 'submitted', never into 'reviewed'. Full-body
-- CREATE OR REPLACE, copied from the live function with only this one
-- condition changed.
create or replace function public.fire_organizer_submitted_automations()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_automation record;
  v_context jsonb;
  v_run_id uuid;
  v_engagement_id uuid;
begin
  if not (
    (TG_OP = 'INSERT' and NEW.status = 'submitted')
    or (TG_OP = 'UPDATE' and NEW.status = 'submitted' and OLD.status is distinct from 'submitted')
  ) then
    return NEW;
  end if;

  v_engagement_id := NEW.engagement_id;
  if v_engagement_id is null then
    select id into v_engagement_id from public.engagements
    where client_id = NEW.client_id and status not in ('Completed', 'Archived')
    order by created_at desc limit 1;
  end if;

  perform public._notify_admins_of_organizer_submitted(NEW.workspace_id, NEW.client_id, NEW.id, NEW.organizer_template_id);

  v_context := jsonb_build_object('organizer_template_id', NEW.organizer_template_id, 'status', NEW.status, 'response_id', NEW.id);

  for v_automation in
    select * from public.automations
    where workspace_id = NEW.workspace_id
      and is_enabled = true
      and status = 'published'
      and trigger_type = 'organizer.submitted'
      and (
        nullif(trigger_config ->> 'organizer_template_id', '') is null
        or trigger_config ->> 'organizer_template_id' = NEW.organizer_template_id::text
      )
  loop
    if public.evaluate_automation_conditions(v_automation.conditions, v_context, NEW.workspace_id, NEW.client_id, v_engagement_id) then
      insert into public.automation_runs (workspace_id, automation_id, engagement_id, client_id, trigger_snapshot, status)
      values (NEW.workspace_id, v_automation.id, v_engagement_id, NEW.client_id, v_context, 'running')
      returning id into v_run_id;

      perform public.start_next_automation_step(v_run_id);
    end if;
  end loop;

  return NEW;
end;
$function$;
