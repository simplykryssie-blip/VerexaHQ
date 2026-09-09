-- 1. Four granular organizer-review permissions, replacing the single
--    blanket organizers.review gate for the actual DECISION actions.
--    organizers.review itself is untouched -- it still gates simply opening
--    the Review Workspace page at all; these four gate which of the four
--    decision buttons on that page a given role can actually click.
insert into public.permissions (key, category, description) values
  ('organizers.review_approve', 'organizers', 'Approve a submitted organizer'),
  ('organizers.review_deny', 'organizers', 'Deny a submitted organizer'),
  ('organizers.review_request_info', 'organizers', 'Flag questions on a submitted organizer and request more information from the client'),
  ('organizers.review_ero', 'organizers', 'Send a submitted organizer to ERO review')
on conflict (key) do nothing;

-- Sensible system-wide defaults, mirroring each role's existing
-- organizers.review grant: Owner/Admin/ERO get all four (they can already
-- fully review today), Reviewer gets everything except Deny (a senior
-- reviewer who still escalates a hard decline rather than making it
-- themself). Every other role keeps its current zero-default, same as
-- organizers.review itself -- a workspace grants a role review access
-- explicitly via Settings > Roles, same mechanism as today.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.is_system_role and r.slug in ('owner', 'admin', 'ero')
  and p.key in ('organizers.review_approve', 'organizers.review_deny', 'organizers.review_request_info', 'organizers.review_ero')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.is_system_role and r.slug = 'reviewer'
  and p.key in ('organizers.review_approve', 'organizers.review_request_info', 'organizers.review_ero')
on conflict do nothing;

-- 2. set_organizer_response_review_status now checks the specific
--    permission for the decision being made, not the blanket
--    organizers.review -- Approved needs review_approve, Rejected needs
--    review_deny. Every other status (In Review / Pending / Corrections
--    Requested) keeps the base organizers.review check -- Corrections
--    Requested is only ever reached internally, via
--    send_organizer_information_request, which already checked
--    review_request_info itself before calling this.
create or replace function public.set_organizer_response_review_status(p_response_id uuid, p_status review_status, p_note text DEFAULT NULL::text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_workspace_id uuid;
  v_status text;
  v_required_permission text;
begin
  select workspace_id, status into v_workspace_id, v_status
  from public.organizer_responses where id = p_response_id;

  if v_workspace_id is null then
    raise exception 'organizer response not found';
  end if;

  v_required_permission := case p_status
    when 'Approved' then 'organizers.review_approve'
    when 'Rejected' then 'organizers.review_deny'
    else 'organizers.review'
  end;
  if not public.has_permission(v_workspace_id, v_required_permission) then
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

-- 3. The "Needs Info" family of RPCs -- flagging fields, sending the
--    request, and the client's-response accept/reject that follows it --
--    all move from the blanket organizers.review to the specific
--    review_request_info permission.
create or replace function public.flag_organizer_field_for_info(p_organizer_response_id uuid, p_organizer_field_id uuid, p_instance_index integer DEFAULT 0, p_note text DEFAULT NULL::text)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
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
  if not public.has_permission(v_workspace_id, 'organizers.review_request_info') then
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
$function$;

create or replace function public.send_organizer_information_request(p_request_id uuid, p_message text, p_due_date date DEFAULT NULL::date, p_tags text[] DEFAULT '{}'::text[], p_send_email boolean DEFAULT false, p_send_sms boolean DEFAULT false, p_show_in_portal boolean DEFAULT true)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
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
  if not public.has_permission(v_workspace_id, 'organizers.review_request_info') then
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
$function$;

create or replace function public.unflag_organizer_information_request_item(p_item_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
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
  if not public.has_permission(v_workspace_id, 'organizers.review_request_info') then
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
$function$;

create or replace function public.approve_organizer_information_request_item(p_item_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_workspace_id uuid;
  v_response_id uuid;
  v_field_id uuid;
  v_instance_index int;
  v_status text;
  v_proposed_value jsonb;
begin
  select req.workspace_id, req.organizer_response_id, item.organizer_field_id, item.instance_index, item.status, item.proposed_value
  into v_workspace_id, v_response_id, v_field_id, v_instance_index, v_status, v_proposed_value
  from public.organizer_information_request_items item
  join public.organizer_information_requests req on req.id = item.request_id
  where item.id = p_item_id;

  if v_workspace_id is null then
    raise exception 'information request item not found';
  end if;
  if not public.has_permission(v_workspace_id, 'organizers.review_request_info') then
    raise exception 'insufficient permissions';
  end if;
  if v_status <> 'client_responded' or v_proposed_value is null then
    raise exception 'this item has no pending response to approve';
  end if;

  insert into public.organizer_response_answers (organizer_response_id, organizer_field_id, instance_index, value)
  values (v_response_id, v_field_id, v_instance_index, v_proposed_value)
  on conflict (organizer_response_id, organizer_field_id, instance_index)
  do update set value = excluded.value, updated_at = now();

  update public.organizer_information_request_items
  set status = 'approved', resolved_by = auth.uid(), resolved_at = now()
  where id = p_item_id;
end;
$function$;

create or replace function public.reject_organizer_information_request_item(p_item_id uuid, p_decision_note text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_workspace_id uuid;
  v_request_id uuid;
  v_status text;
begin
  select req.workspace_id, item.request_id, item.status
  into v_workspace_id, v_request_id, v_status
  from public.organizer_information_request_items item
  join public.organizer_information_requests req on req.id = item.request_id
  where item.id = p_item_id;

  if v_workspace_id is null then
    raise exception 'information request item not found';
  end if;
  if not public.has_permission(v_workspace_id, 'organizers.review_request_info') then
    raise exception 'insufficient permissions';
  end if;
  if v_status <> 'client_responded' then
    raise exception 'this item has no pending response to reject';
  end if;
  if nullif(btrim(p_decision_note), '') is null then
    raise exception 'a reason is required';
  end if;

  update public.organizer_information_request_items
  set status = 'rejected', decision_note = p_decision_note, resolved_by = auth.uid(), resolved_at = now()
  where id = p_item_id;

  perform public.notify_organizer_information_request(v_request_id, 'One of your submitted answers was not accepted: ' || p_decision_note);
end;
$function$;

-- 4. ERO Review: a fourth review decision, deliberately simple per spec --
--    assign the client to the workspace owner (the ERO), notify them, and
--    create exactly one task for them to review the organizer and read the
--    client's notes. No review_status change, no pipeline movement -- the
--    organizer stays right where it is (e.g. "Organizer Under Review")
--    until the ERO makes their own Approve/Deny/Needs Info call from there.
create or replace function public.send_organizer_to_ero_review(p_response_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_workspace_id uuid;
  v_client_id uuid;
  v_engagement_id uuid;
  v_client_name text;
  v_ero_user_id uuid;
begin
  select workspace_id, client_id, engagement_id
  into v_workspace_id, v_client_id, v_engagement_id
  from public.organizer_responses where id = p_response_id;

  if v_workspace_id is null then
    raise exception 'organizer response not found';
  end if;
  if not public.has_permission(v_workspace_id, 'organizers.review_ero') then
    raise exception 'insufficient permissions';
  end if;

  select user_id into v_ero_user_id
  from public.workspace_users
  where workspace_id = v_workspace_id and is_owner = true and status = 'active'
  limit 1;

  if v_ero_user_id is null then
    raise exception 'this workspace has no active owner to assign ERO review to';
  end if;

  select coalesce(nullif(trim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')), ''), business_name, 'A client')
  into v_client_name
  from public.clients where id = v_client_id;

  update public.organizer_responses set assigned_reviewer_id = v_ero_user_id where id = p_response_id;

  if public.is_notification_enabled(v_ero_user_id, v_workspace_id, 'ORGANIZER_ERO_REVIEW_REQUESTED', 'In-App') then
    perform public.create_notification(
      v_workspace_id, v_ero_user_id, 'ORGANIZER_ERO_REVIEW_REQUESTED', 'organizer_ero_review_requested',
      jsonb_build_object('client_name', v_client_name), array['In-App'], 'High', 'organizer_response', p_response_id
    );
  end if;

  insert into public.tasks (workspace_id, engagement_id, client_id, title, description, assigned_staff_id, due_date, priority)
  values (
    v_workspace_id, v_engagement_id, case when v_engagement_id is null then v_client_id else null end,
    'ERO review: ' || v_client_name,
    'Review the submitted organizer and read the client''s notes, then approve, deny, or request more information.',
    v_ero_user_id, (now() + interval '1 day')::date, 'high'
  );

  insert into public.activity_log (workspace_id, actor_id, entity_type, entity_id, activity_type, event_type, description, metadata)
  values (
    v_workspace_id, auth.uid(), case when v_engagement_id is not null then 'engagement' else 'client' end,
    coalesce(v_engagement_id, v_client_id), 'ORGANIZER_ERO_REVIEW_REQUESTED', 'ORGANIZER_ERO_REVIEW_REQUESTED',
    'Sent an organizer to ERO review', jsonb_build_object('response_id', p_response_id)
  );
end;
$function$;
