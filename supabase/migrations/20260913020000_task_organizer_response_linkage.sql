-- Tasks only ever recorded engagement_id/client_id, so a task created about
-- a specific organizer response (e.g. "ERO review: Krystal") had no way to
-- deep-link back to that organizer -- only to the engagement or client it
-- happened to also be attached to. Nullable, additive column so a task can
-- name the organizer response it's actually about; every other existing
-- task (the vast majority, created via the generic create_task automation
-- step) is unaffected and simply leaves it null.
alter table public.tasks
  add column if not exists related_organizer_response_id uuid references public.organizer_responses(id) on delete set null;

create index if not exists idx_tasks_related_organizer_response on public.tasks (related_organizer_response_id) where related_organizer_response_id is not null;

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

  insert into public.tasks (workspace_id, engagement_id, client_id, related_organizer_response_id, title, description, assigned_staff_id, due_date, priority)
  values (
    v_workspace_id, v_engagement_id, case when v_engagement_id is null then v_client_id else null end, p_response_id,
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
