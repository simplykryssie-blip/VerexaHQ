-- Epic 3A: Engagement Foundation -- Part 11 (fix a regression from 0057).
--
-- 0057 standardized notification_queue.channel on the capitalized
-- convention (In-App/Email/SMS/Portal/Push), which broke Phase 0's
-- invite_workspace_user() -- it still hardcoded the old lowercase 'portal'.
-- Caught immediately by the Epic 3A smoke test's invite_workspace_user call.
-- One-line fix, otherwise byte-for-byte unchanged.

create or replace function public.invite_workspace_user(p_workspace_id uuid, p_user_id uuid, p_role_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_id uuid;
begin
  if not public.is_workspace_admin(p_workspace_id) then
    raise exception 'insufficient permissions to invite members to this workspace';
  end if;
  if not exists (select 1 from public.roles where id = p_role_id and (workspace_id is null or workspace_id = p_workspace_id)) then
    raise exception 'role does not belong to this workspace';
  end if;

  insert into public.workspace_users (workspace_id, user_id, role_id, status, invited_by, invited_at)
  values (p_workspace_id, p_user_id, p_role_id, 'invited', auth.uid(), now())
  on conflict (workspace_id, user_id) do update
    set role_id = excluded.role_id, status = 'invited', invited_by = excluded.invited_by, invited_at = now()
  returning id into v_id;

  insert into public.notification_queue (workspace_id, recipient_user_id, channel, template_key, payload)
  values (p_workspace_id, p_user_id, 'Portal', 'workspace_invitation',
    jsonb_build_object('workspace_id', p_workspace_id, 'invited_by', auth.uid()));

  return v_id;
end;
$function$;
