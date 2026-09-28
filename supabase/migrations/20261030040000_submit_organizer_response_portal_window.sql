-- Suspension/Archive lifecycle hardening, item 5 (submit_organizer_response
-- portal-window gap). This SECURITY DEFINER RPC is the actual write path
-- that flips organizer_responses.status to 'submitted' -- it does its own
-- permission check rather than relying on the organizer_responses_update
-- RLS policy, so the Day 0-30 window enforcement added there
-- (20261029000000) never applied to it. A portal user could submit an
-- organizer response on an Archived or Permanently Archived workspace
-- indefinitely. Staff authorization (has_permission) is unchanged; staff
-- additionally now require the workspace to be operational, matching every
-- other staff-mutation path.
CREATE OR REPLACE FUNCTION public.submit_organizer_response(p_response_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_workspace_id uuid;
  v_client_id uuid;
  v_template_id uuid;
  v_client_name text;
  v_client_email text;
begin
  select workspace_id, client_id, organizer_template_id
    into v_workspace_id, v_client_id, v_template_id
    from public.organizer_responses where id = p_response_id;
  if v_workspace_id is null then
    raise exception 'organizer response not found';
  end if;

  if public.has_permission(v_workspace_id, 'engagements.manage') then
    if not public.is_workspace_operational(v_workspace_id) then
      raise exception 'this workspace is not currently operational';
    end if;
  elsif public.is_portal_user(v_client_id) then
    if not public.is_client_portal_window_active(v_workspace_id) then
      raise exception 'the client portal is not currently available for this workspace';
    end if;
  else
    raise exception 'insufficient permissions';
  end if;

  update public.organizer_responses
  set status = 'submitted', submitted_at = now(), updated_at = now()
  where id = p_response_id;

  insert into public.activity_log (workspace_id, entity_type, entity_id, activity_type, description)
  values (v_workspace_id, 'client', v_client_id, 'organizer_submitted', 'Tax organizer submitted');

  select coalesce(nullif(btrim(coalesce(business_name, '')), ''), nullif(btrim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')), '')),
         primary_email
    into v_client_name, v_client_email
    from public.clients where id = v_client_id;

  perform public.resolve_and_sign_organizer_response(p_response_id, v_workspace_id, v_template_id, coalesce(v_client_name, ''), v_client_email);
end;
$function$
;
