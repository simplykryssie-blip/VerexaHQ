-- A flagged organizer field can have conditional logic that reveals a new
-- required question once the client changes their answer (e.g. marital
-- status flips to "Married" and now spouse SSN/DOB/etc. are required) --
-- but that newly-required field was never flagged by staff, so it has no
-- organizer_information_request_items row and neither
-- propose_organizer_answer_correction nor save_organizer_reopened_field_answer
-- can save an answer for it (both require an existing p_item_id). This RPC
-- covers that case directly: it finds (or creates) the item row itself,
-- scoped to whichever information request on this response is still open,
-- so the field flows through the same review path as anything else the
-- client submits during a correction pass.
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
    where id = v_item_id and status not in ('pending', 'client_responded')
  ) then
    raise exception 'this item is no longer open';
  end if;

  insert into public.organizer_response_answers (organizer_response_id, organizer_field_id, instance_index, value)
  values (p_response_id, p_organizer_field_id, 0, p_value)
  on conflict (organizer_response_id, organizer_field_id, instance_index)
  do update set value = excluded.value, updated_at = now();

  update public.organizer_information_request_items
  set status = 'resolved', resolved_at = now()
  where id = v_item_id;
end;
$function$
;
