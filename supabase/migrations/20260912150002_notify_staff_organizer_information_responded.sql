-- Nothing told staff when a client responded to a flagged/reopened
-- organizer question -- the response also drops out of /review-queue the
-- moment it moves past status='submitted' (the very first review), so a
-- client's correction could sit invisible with no way for anyone to know
-- it needs a second look. Two independent fixes:
--
-- 1. This RPC (called once by the client's own "Submit changes" batch,
--    after every item in it has actually saved -- not one notification
--    per item) tells whoever should look at it.
-- 2. review-queue's own query (in the app, not here) is separately
--    updated to include responses with an open information request
--    regardless of the response's own status.
create or replace function public.notify_staff_organizer_information_responded(p_response_id uuid, p_item_count integer)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_client_id uuid;
  v_workspace_id uuid;
  v_engagement_id uuid;
  v_assigned_reviewer_id uuid;
  v_reviewed_by uuid;
  v_engagement_assigned_staff_id uuid;
  v_recipient_id uuid;
  v_client_name text;
begin
  select r.client_id, r.workspace_id, r.engagement_id, r.assigned_reviewer_id, r.reviewed_by
  into v_client_id, v_workspace_id, v_engagement_id, v_assigned_reviewer_id, v_reviewed_by
  from public.organizer_responses r
  where r.id = p_response_id;

  if v_client_id is null then
    raise exception 'organizer response not found';
  end if;
  if not public.is_portal_user(v_client_id) then
    raise exception 'insufficient permissions';
  end if;

  select coalesce(nullif(trim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')), ''), business_name, 'A client')
  into v_client_name
  from public.clients where id = v_client_id;

  if v_engagement_id is not null then
    select assigned_staff_id into v_engagement_assigned_staff_id
    from public.engagements where id = v_engagement_id;
  end if;

  v_recipient_id := coalesce(v_assigned_reviewer_id, v_reviewed_by, v_engagement_assigned_staff_id);

  if v_recipient_id is null then
    select user_id into v_recipient_id
    from public.workspace_users
    where workspace_id = v_workspace_id and is_owner = true and status = 'active'
    limit 1;
  end if;

  if v_recipient_id is null or not public.is_notification_enabled(v_recipient_id, v_workspace_id, 'ORGANIZER_INFORMATION_RESPONDED', 'In-App') then
    return;
  end if;

  perform public.create_notification(
    v_workspace_id, v_recipient_id, 'ORGANIZER_INFORMATION_RESPONDED', 'organizer_information_responded',
    jsonb_build_object('client_name', v_client_name, 'item_count', p_item_count),
    array['In-App'], 'Medium', 'organizer_response', p_response_id
  );
end;
$function$
;
