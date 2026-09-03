-- Epic 3A: Engagement Foundation -- Part 6 (Review Engine + Notification Foundation).
--
-- Review Engine: respond_to_engagement_share() (Revision Sprint) already
-- covers Approve/Reject. This extends the same engagement_shares row to
-- support Request Corrections / Comment / Withdraw too, and adds
-- engagement_review_actions so review history is actually stored (today
-- engagement_shares only ever holds the *current* decision) -- "Review
-- history must be stored" from the spec.
--
-- Notification Foundation: notification_queue (Phase 0) already has
-- channels/event_type/priority/template_key/payload -- exactly what's
-- asked for. Its INSERT policy is admin-only (workspace admins configuring
-- notifications by hand), so a SECURITY DEFINER create_notification() helper
-- is added for triggers/RPCs to raise a notification on behalf of any event,
-- regardless of which user's action triggered it. No email/SMS is sent
-- directly anywhere here -- only queued, per "Notification destinations
-- will be implemented later."

alter table public.engagement_shares drop constraint if exists case_shares_status_check;
alter table public.engagement_shares add constraint engagement_shares_status_check check (status in (
  'pending', 'approved', 'rejected', 'expired', 'corrections_requested', 'withdrawn'
));

create table public.engagement_review_actions (
  id uuid primary key default gen_random_uuid(),
  engagement_share_id uuid not null references public.engagement_shares(id) on delete cascade,
  action text not null check (action in ('approve', 'reject', 'request_corrections', 'comment', 'withdraw')),
  actor_id uuid references auth.users(id) on delete set null,
  comment text,
  created_at timestamptz not null default now()
);
comment on table public.engagement_review_actions is 'Full review history for a shared Engagement -- every approve/reject/request_corrections/comment/withdraw, not just the current engagement_shares.status. Ownership of the Engagement never transfers to the reviewing (ERO) workspace; this table only ever records actions taken during review.';

create index idx_engagement_review_actions_share on public.engagement_review_actions (engagement_share_id, created_at desc);

alter table public.engagement_review_actions enable row level security;
create policy engagement_review_actions_select on public.engagement_review_actions for select using (
  exists (
    select 1 from public.engagement_shares es
    where es.id = engagement_review_actions.engagement_share_id
      and (public.is_workspace_member(es.workspace_id) or public.is_workspace_member(es.shared_with_workspace_id))
  )
);
-- No insert/update/delete policy for authenticated: written only by the
-- SECURITY DEFINER review functions below.

-- ============================================================================
-- Notification Foundation helper
-- ============================================================================
create or replace function public.create_notification(
  p_workspace_id uuid,
  p_recipient_user_id uuid,
  p_event_type text,
  p_template_key text,
  p_payload jsonb default '{}'::jsonb,
  p_channels text[] default array['In-App'],
  p_priority text default 'Medium'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.notification_queue (workspace_id, recipient_user_id, channel, channels, event_type, template_key, payload, priority)
  values (p_workspace_id, p_recipient_user_id, p_channels[1], p_channels, p_event_type, p_template_key, p_payload, p_priority)
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function public.create_notification(uuid, uuid, text, text, jsonb, text[], text) from public, anon;
grant execute on function public.create_notification(uuid, uuid, text, text, jsonb, text[], text) to authenticated;

-- ============================================================================
-- Review Engine: extend respond_to_engagement_share (Approve/Reject) with
-- history logging + a notification back to whoever shared it, and add the
-- three actions it didn't cover.
-- ============================================================================
create or replace function public.respond_to_engagement_share(p_engagement_share_id uuid, p_approve boolean, p_decision_notes text default null::text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_ero_workspace_id uuid;
  v_shared_by_workspace_id uuid;
  v_shared_by uuid;
begin
  select shared_with_workspace_id, workspace_id, shared_by into v_ero_workspace_id, v_shared_by_workspace_id, v_shared_by
  from public.engagement_shares where id = p_engagement_share_id;
  if v_ero_workspace_id is null then
    raise exception 'engagement share not found';
  end if;
  if not public.is_workspace_member(v_ero_workspace_id) then
    raise exception 'insufficient permissions to respond to this engagement share';
  end if;
  if not public.has_permission(v_ero_workspace_id, 'engagements.approve_review') then
    raise exception 'insufficient permissions to approve or reject engagement reviews';
  end if;

  update public.engagement_shares set
    status = case when p_approve then 'approved' else 'rejected' end,
    decision_notes = p_decision_notes,
    reviewed_by = auth.uid(),
    reviewed_at = now()
  where id = p_engagement_share_id;

  insert into public.engagement_review_actions (engagement_share_id, action, actor_id, comment)
  values (p_engagement_share_id, case when p_approve then 'approve' else 'reject' end, auth.uid(), p_decision_notes);

  if v_shared_by is not null then
    perform public.create_notification(
      v_shared_by_workspace_id, v_shared_by, 'ENGAGEMENT_SHARE_' || upper(case when p_approve then 'approved' else 'rejected' end),
      'engagement_share_decision', jsonb_build_object('engagement_share_id', p_engagement_share_id, 'approved', p_approve)
    );
  end if;
end;
$function$;

create or replace function public.review_request_corrections(p_engagement_share_id uuid, p_comment text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ero_workspace_id uuid;
  v_shared_by_workspace_id uuid;
  v_shared_by uuid;
begin
  select shared_with_workspace_id, workspace_id, shared_by into v_ero_workspace_id, v_shared_by_workspace_id, v_shared_by
  from public.engagement_shares where id = p_engagement_share_id;
  if v_ero_workspace_id is null then
    raise exception 'engagement share not found';
  end if;
  if not public.has_permission(v_ero_workspace_id, 'engagements.approve_review') then
    raise exception 'insufficient permissions to request corrections on this engagement review';
  end if;

  update public.engagement_shares set
    status = 'corrections_requested', decision_notes = p_comment, reviewed_by = auth.uid(), reviewed_at = now()
  where id = p_engagement_share_id;

  insert into public.engagement_review_actions (engagement_share_id, action, actor_id, comment)
  values (p_engagement_share_id, 'request_corrections', auth.uid(), p_comment);

  if v_shared_by is not null then
    perform public.create_notification(
      v_shared_by_workspace_id, v_shared_by, 'ENGAGEMENT_SHARE_CORRECTIONS_REQUESTED',
      'engagement_share_decision', jsonb_build_object('engagement_share_id', p_engagement_share_id)
    );
  end if;
end;
$$;

create or replace function public.review_comment(p_engagement_share_id uuid, p_comment text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ero_workspace_id uuid;
  v_shared_by_workspace_id uuid;
begin
  select shared_with_workspace_id, workspace_id into v_ero_workspace_id, v_shared_by_workspace_id
  from public.engagement_shares where id = p_engagement_share_id;
  if v_ero_workspace_id is null then
    raise exception 'engagement share not found';
  end if;
  if not public.is_workspace_member(v_ero_workspace_id) and not public.is_workspace_member(v_shared_by_workspace_id) then
    raise exception 'insufficient permissions to comment on this engagement review';
  end if;

  insert into public.engagement_review_actions (engagement_share_id, action, actor_id, comment)
  values (p_engagement_share_id, 'comment', auth.uid(), p_comment);
end;
$$;

create or replace function public.withdraw_engagement_share(p_engagement_share_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shared_by_workspace_id uuid;
  v_status text;
begin
  select workspace_id, status into v_shared_by_workspace_id, v_status
  from public.engagement_shares where id = p_engagement_share_id;
  if v_shared_by_workspace_id is null then
    raise exception 'engagement share not found';
  end if;
  if not public.has_permission(v_shared_by_workspace_id, 'engagements.share') then
    raise exception 'insufficient permissions to withdraw this engagement share';
  end if;
  if v_status <> 'pending' then
    raise exception 'only a pending engagement share can be withdrawn';
  end if;

  update public.engagement_shares set status = 'withdrawn', reviewed_at = now() where id = p_engagement_share_id;

  insert into public.engagement_review_actions (engagement_share_id, action, actor_id)
  values (p_engagement_share_id, 'withdraw', auth.uid());
end;
$$;

revoke execute on function public.review_request_corrections(uuid, text) from public, anon;
grant execute on function public.review_request_corrections(uuid, text) to authenticated;
revoke execute on function public.review_comment(uuid, text) from public, anon;
grant execute on function public.review_comment(uuid, text) to authenticated;
revoke execute on function public.withdraw_engagement_share(uuid) from public, anon;
grant execute on function public.withdraw_engagement_share(uuid) to authenticated;

-- ============================================================================
-- Wire a couple of key engagement events into the Notification Foundation
-- (extending, not replacing, the Timeline triggers from 0051 -- CREATE OR
-- REPLACE, same trigger, same table, one more insert each).
-- ============================================================================
create or replace function public.record_engagement_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.activity_log (workspace_id, actor_id, entity_type, entity_id, activity_type, event_type, description, metadata)
  values (
    new.workspace_id, (select auth.uid()), 'engagement', new.id, 'ENGAGEMENT_CREATED', 'ENGAGEMENT_CREATED',
    'Engagement ' || new.engagement_number || ' was created',
    jsonb_build_object('engagement_number', new.engagement_number, 'client_id', new.client_id)
  );

  if new.assigned_staff_id is not null then
    perform public.create_notification(
      new.workspace_id, new.assigned_staff_id, 'ENGAGEMENT_ASSIGNED', 'engagement_assigned',
      jsonb_build_object('engagement_id', new.id, 'engagement_number', new.engagement_number)
    );
  end if;
  return new;
end;
$$;

create or replace function public.record_engagement_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    insert into public.engagement_status_history (engagement_id, old_status, new_status, changed_by)
    values (new.id, old.status, new.status, (select auth.uid()));

    insert into public.activity_log (workspace_id, actor_id, entity_type, entity_id, activity_type, event_type, description, metadata)
    values (
      new.workspace_id, (select auth.uid()), 'engagement', new.id, 'STATUS_CHANGE', 'STATUS_CHANGE',
      'Engagement ' || new.engagement_number || ' status changed from ' || coalesce(old.status, 'NULL') || ' to ' || new.status,
      jsonb_build_object('old_status', old.status, 'new_status', new.status)
    );

    if new.status = 'Waiting On Review' and new.reviewer_id is not null then
      perform public.create_notification(
        new.workspace_id, new.reviewer_id, 'ENGAGEMENT_WAITING_ON_REVIEW', 'engagement_waiting_on_review',
        jsonb_build_object('engagement_id', new.id, 'engagement_number', new.engagement_number)
      );
    end if;

    if new.status = 'Completed' and new.completed_date is null then
      new.completed_date := now();
    end if;
    if new.status = 'Archived' and new.archived_date is null then
      new.archived_date := now();
    end if;
  end if;
  return new;
end;
$$;
