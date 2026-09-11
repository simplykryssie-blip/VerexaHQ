-- Two false-positive checks in validate_automation() were blocking correctly
-- configured automations from activating:
--
-- 1. send_notification was checked for a staff_id, but that action type is
--    always a broadcast to the workspace owner + every active staff member
--    (see WorkflowBuilder.tsx's "Notifies the workspace owner and every
--    active staff member -- no need to pick one person") -- it never has a
--    staff_id in its config, by design. assign_user is the action with a
--    staff_id, and it already has its own separate check below.
--
-- 2. send_organizer_template was required to have organizer_template_id set,
--    but execute_automation_step() explicitly supports leaving it blank --
--    it falls back to resolving the organizer from the client's most recent
--    service interest at send time. Blank is a legitimate "auto-detect from
--    service" configuration, not a mistake. Still flag it if a configured
--    template id points at something that no longer exists.
create or replace function public.validate_automation(p_automation_id uuid)
 returns TABLE(step_order integer, action_type text, display_name text, issue text)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_workspace_id uuid;
  v_trigger_type text;
  v_step_count int;
  v_step record;
begin
  select workspace_id, trigger_type into v_workspace_id, v_trigger_type from public.automations where id = p_automation_id;
  if v_workspace_id is null then
    raise exception 'automation not found';
  end if;
  if not public.has_permission(v_workspace_id, 'automations.manage') then
    raise exception 'insufficient permissions to validate this automation';
  end if;

  if v_trigger_type is null or btrim(v_trigger_type) = '' then
    return query select 0, 'trigger'::text, 'Trigger'::text, 'No trigger is configured for this automation.'::text;
  end if;

  select count(*) into v_step_count from public.automation_steps where automation_id = p_automation_id;
  if v_step_count = 0 then
    return query select 0, 'no_steps'::text, 'Steps'::text, 'This automation has no steps, so activating it does nothing.'::text;
  end if;

  for v_step in select * from public.automation_steps where automation_id = p_automation_id order by display_order loop
    if v_step.action_type = 'send_organizer_template' then
      if nullif(v_step.action_config->>'organizer_template_id', '') is not null
         and not exists (select 1 from public.organizer_templates where id = (v_step.action_config->>'organizer_template_id')::uuid) then
        return query select v_step.display_order, v_step.action_type, coalesce(v_step.display_name, 'Send Organizer'), 'The configured organizer no longer exists.';
      end if;

    elsif v_step.action_type = 'send_email' then
      if nullif(v_step.action_config->>'template_slug', '') is null then
        return query select v_step.display_order, v_step.action_type, coalesce(v_step.display_name, 'Send Email'), 'No email template is selected for this step.';
      elsif not exists (
        select 1 from public.email_templates
        where slug = v_step.action_config->>'template_slug' and status = 'published' and (workspace_id is null or workspace_id = v_workspace_id)
      ) then
        return query select v_step.display_order, v_step.action_type, coalesce(v_step.display_name, 'Send Email'), 'The selected email template does not exist or is not published.';
      end if;

    elsif v_step.action_type = 'send_sms' then
      if nullif(v_step.action_config->>'template_slug', '') is null then
        return query select v_step.display_order, v_step.action_type, coalesce(v_step.display_name, 'Send SMS'), 'No SMS template is selected for this step.';
      elsif not exists (
        select 1 from public.sms_templates
        where slug = v_step.action_config->>'template_slug' and status = 'published' and (workspace_id is null or workspace_id = v_workspace_id)
      ) then
        return query select v_step.display_order, v_step.action_type, coalesce(v_step.display_name, 'Send SMS'), 'The selected SMS template does not exist or is not published.';
      end if;

    elsif v_step.action_type = 'send_engagement_letter' and nullif(v_step.action_config->>'engagement_letter_template_id', '') is null then
      return query select v_step.display_order, v_step.action_type, coalesce(v_step.display_name, 'Send Engagement Letter'), 'No engagement letter template is configured for this step.';

    elsif v_step.action_type = 'send_document_request' and nullif(v_step.action_config->>'document_request_template_id', '') is null then
      return query select v_step.display_order, v_step.action_type, coalesce(v_step.display_name, 'Request Documents'), 'No document request template is configured for this step.';

    elsif v_step.action_type = 'assign_user' and nullif(v_step.action_config->>'staff_id', '') is null then
      return query select v_step.display_order, v_step.action_type, coalesce(v_step.display_name, 'Assign Staff'), 'No staff member is selected for this step.';

    elsif v_step.action_type = 'move_engagement_stage' and nullif(v_step.action_config->>'process_stage_id', '') is null then
      return query select v_step.display_order, v_step.action_type, coalesce(v_step.display_name, 'Move Pipeline Stage'), 'No target pipeline stage is selected for this step.';

    elsif v_step.action_type = 'move_lead_stage' and nullif(v_step.action_config->>'lead_stage_key', '') is null then
      return query select v_step.display_order, v_step.action_type, coalesce(v_step.display_name, 'Move Lead Stage'), 'No target lead stage is selected for this step.';

    elsif v_step.action_type = 'start_workflow' then
      if nullif(v_step.action_config->>'automation_id', '') is null then
        return query select v_step.display_order, v_step.action_type, coalesce(v_step.display_name, 'Start Workflow'), 'No automation is selected to start.';
      elsif not exists (
        select 1 from public.automations where id = (v_step.action_config->>'automation_id')::uuid and workspace_id = v_workspace_id and status = 'published'
      ) then
        return query select v_step.display_order, v_step.action_type, coalesce(v_step.display_name, 'Start Workflow'), 'The selected automation to start is missing or not published.';
      end if;

    elsif v_step.action_type = 'webhook' and nullif(v_step.action_config->>'url', '') is null then
      return query select v_step.display_order, v_step.action_type, coalesce(v_step.display_name, 'Webhook'), 'No webhook URL is configured for this step.';

    elsif v_step.action_type = 'create_task' and nullif(v_step.action_config->>'title', '') is null then
      return query select v_step.display_order, v_step.action_type, coalesce(v_step.display_name, 'Create Task'), 'No task title is configured for this step.';

    elsif v_step.action_type = 'send_portal_message' and nullif(v_step.action_config->>'body', '') is null then
      return query select v_step.display_order, v_step.action_type, coalesce(v_step.display_name, 'Send Portal Message'), 'No message body is configured for this step.';

    elsif v_step.action_type = 'add_tag' and nullif(v_step.action_config->>'tag', '') is null then
      return query select v_step.display_order, v_step.action_type, coalesce(v_step.display_name, 'Add Tag'), 'No tag is configured for this step.';

    elsif v_step.action_type = 'mark_lead_lost' and nullif(v_step.action_config->>'reason', '') is null then
      return query select v_step.display_order, v_step.action_type, coalesce(v_step.display_name, 'Mark Lead Lost'), 'No reason is configured for this step.';

    elsif v_step.action_type = 'update_client' and nullif(v_step.action_config->>'field', '') is null then
      return query select v_step.display_order, v_step.action_type, coalesce(v_step.display_name, 'Update Client'), 'No field is selected to update for this step.';
    end if;
  end loop;

  return;
end;
$function$;
