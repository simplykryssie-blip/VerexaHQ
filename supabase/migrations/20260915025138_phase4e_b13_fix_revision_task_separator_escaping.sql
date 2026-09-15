-- Fixes a real bug found in live testing of the prior migration
-- (phase4e_b13_one_active_revision_task): the merged-description
-- separator concatenated an E-escaped literal with a second, plain
-- (non-E-prefixed) literal also containing \n -- only the first literal's
-- \n was interpreted as a real newline; the second rendered as a literal
-- backslash-n in the stored task description. Both literal segments now
-- use the E prefix so the whole separator escapes consistently.
create or replace function public.request_client_review_changes(p_engagement_id uuid, p_comment text default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_workspace_id uuid;
  v_client_id uuid;
  v_stage_name text;
  v_task_id uuid;
  v_description text;
begin
  select workspace_id, client_id, stage_name
  into v_workspace_id, v_client_id, v_stage_name
  from public._get_engagement_active_stage_name(p_engagement_id);

  if v_workspace_id is null then
    raise exception 'engagement not found or has no active pipeline run';
  end if;
  if not public.is_portal_user(v_client_id) then
    raise exception 'not authorized to respond to this engagement';
  end if;
  if not public.is_workspace_operational(v_workspace_id) then
    raise exception 'this workspace is not currently operational';
  end if;
  if v_stage_name is distinct from 'Client Review' then
    raise exception 'this engagement is not currently in client review';
  end if;

  update public.engagements set status = 'Corrections Requested' where id = p_engagement_id;

  insert into public.activity_log (workspace_id, actor_id, entity_type, entity_id, activity_type, event_type, description, metadata)
  values (v_workspace_id, auth.uid(), 'engagement', p_engagement_id, 'CLIENT_REVIEW_CHANGES_REQUESTED', 'CLIENT_REVIEW_CHANGES_REQUESTED', 'Client requested changes to the prepared return', jsonb_build_object('comment', p_comment));

  v_description := coalesce(p_comment, '(no comment provided)');

  insert into public.tasks (workspace_id, engagement_id, title, description, priority, due_date)
  values (v_workspace_id, p_engagement_id, 'Revise return per client feedback', v_description, 'high', (now() + interval '1 day')::date)
  on conflict (engagement_id) where title = 'Revise return per client feedback' and status in ('pending', 'in_progress')
  do update set
    description = public.tasks.description || E'\n\n--- New client request (' || to_char(now(), 'YYYY-MM-DD HH24:MI') || E') ---\n' || excluded.description,
    due_date = excluded.due_date,
    updated_at = now()
  returning id into v_task_id;

  perform public._notify_workspace_admins_of_engagement_event(v_workspace_id, p_engagement_id, 'client_review_changes_requested', 'client-review-changes-requested-staff-notification', jsonb_build_object('comment', p_comment, 'task_id', v_task_id));
end;
$function$;
