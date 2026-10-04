-- A client's answer to a previously-blank flagged field applied instantly
-- (no staff gate), while a correction to an already-answered field sat in
-- 'client_responded' awaiting an explicit approve/reject decision -- two
-- different pipelines for what a reviewer experiences as the same event
-- ("the client responded to something I flagged"). Unify both onto the
-- propose/approve/reject pipeline: neither kind of item touches
-- organizer_response_answers until a reviewer explicitly approves it.

create or replace function public.save_organizer_reopened_field_answer(p_item_id uuid, p_value jsonb)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
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
  if v_was_answered then
    raise exception 'this question already has an answer -- propose a correction instead';
  end if;
  if v_status not in ('pending', 'client_responded', 'rejected') then
    raise exception 'this item is no longer open';
  end if;

  update public.organizer_information_request_items
  set proposed_value = p_value, status = 'client_responded', decision_note = null
  where id = p_item_id;

  update public.organizer_information_requests
  set status = 'responded', responded_at = coalesce(responded_at, now())
  where id = v_request_id and status in ('active', 'viewed');
end;
$function$;

create or replace function public.save_organizer_dynamic_required_answer(p_response_id uuid, p_organizer_field_id uuid, p_value jsonb)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_client_id uuid;
  v_template_id uuid;
  v_request_id uuid;
  v_item_id uuid;
begin
  select client_id, organizer_template_id into v_client_id, v_template_id
  from public.organizer_responses
  where id = p_response_id;

  if v_client_id is null then
    raise exception 'organizer response not found';
  end if;
  if not public.is_portal_user(v_client_id) then
    raise exception 'insufficient permissions';
  end if;
  if not exists (
    select 1 from public.organizer_fields
    where id = p_organizer_field_id and organizer_template_id = v_template_id
  ) then
    raise exception 'field does not belong to this organizer';
  end if;

  select id into v_request_id
  from public.organizer_information_requests
  where organizer_response_id = p_response_id and status not in ('resolved', 'draft')
  order by created_at desc
  limit 1;

  if v_request_id is null then
    raise exception 'no open information request on this organizer to attach this answer to';
  end if;

  select id into v_item_id
  from public.organizer_information_request_items
  where request_id = v_request_id and organizer_field_id = p_organizer_field_id and instance_index = 0;

  if v_item_id is null then
    insert into public.organizer_information_request_items
      (request_id, organizer_field_id, instance_index, note, status, was_answered_when_flagged)
    values
      (v_request_id, p_organizer_field_id, 0, 'Became required based on an updated answer elsewhere in the organizer.', 'pending', false)
    returning id into v_item_id;
  elsif exists (
    select 1 from public.organizer_information_request_items
    where id = v_item_id and status not in ('pending', 'client_responded', 'rejected')
  ) then
    raise exception 'this item is no longer open';
  end if;

  update public.organizer_information_request_items
  set proposed_value = p_value, status = 'client_responded', decision_note = null
  where id = v_item_id;

  update public.organizer_information_requests
  set status = 'responded', responded_at = coalesce(responded_at, now())
  where id = v_request_id and status in ('active', 'viewed');
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
  if not public.has_permission(v_workspace_id, 'organizers.review') then
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
  if not public.has_permission(v_workspace_id, 'organizers.review') then
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
