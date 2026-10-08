-- Migration-history recovery: validate_automation.
--
-- PR #337 shipped this as two separate "read pg_get_functiondef, text-
-- replace an anchor string, re-execute" migrations (automation_trigger_
-- type_validation.sql for the known-trigger-types check,
-- workflow_publish_validation_enforcement.sql for the webhook-integration
-- check), each anchored to a specific prior snapshot of this function's
-- body. validate_automation has its own independent fix history on main
-- (fix_validate_automation_false_positives, close_validate_automation_gaps,
-- fix_validate_automation_multi_tag) -- replaying either anchor-patch here
-- would either fail outright (anchor not found, which both migrations
-- correctly guard against rather than corrupting anything) or, worse,
-- apply against the wrong base. Captured verbatim via pg_get_functiondef
-- against production instead, which already carries both checks correctly
-- integrated into the current function body.
CREATE OR REPLACE FUNCTION public.validate_automation(p_automation_id uuid)
 RETURNS TABLE(step_order integer, action_type text, display_name text, issue text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  if v_trigger_type is not null and btrim(v_trigger_type) <> '' and not (v_trigger_type = any(public.known_automation_trigger_types())) then
    return query select 0, 'trigger'::text, 'Trigger'::text, format('"%s" is not a recognized trigger type -- this workflow will never fire until its trigger is reconfigured.', v_trigger_type)::text;
  end if;

  select count(*) into v_step_count from public.automation_steps where automation_id = p_automation_id;
  if v_step_count = 0 then
    return query select 0, 'no_steps'::text, 'Steps'::text, 'This automation has no steps, so activating it does nothing.'::text;
  end if;

  if v_trigger_type = 'webhook.received' then
    declare
      v_integration_id text;
    begin
      select trigger_config->>'integration_id' into v_integration_id from public.automations where id = p_automation_id;
      if nullif(v_integration_id, '') is not null then
        if not exists (
          select 1 from public.webhook_integrations wi
          where wi.id = v_integration_id::uuid and wi.workspace_id = v_workspace_id and wi.status = 'active'
        ) then
          return query select 0, 'trigger'::text, 'Trigger'::text, 'The webhook integration configured for this trigger no longer exists, belongs to a different workspace, or has been disabled.'::text;
        end if;
      end if;
    end;
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

    elsif v_step.action_type = 'send_document_for_signature' and nullif(v_step.action_config->>'attachment_id', '') is null then
      return query select v_step.display_order, v_step.action_type, coalesce(v_step.display_name, 'Send Document for Signature'), 'No document is uploaded for this step.';

    elsif v_step.action_type = 'send_document_request' and nullif(v_step.action_config->>'document_request_template_id', '') is null then
      return query select v_step.display_order, v_step.action_type, coalesce(v_step.display_name, 'Request Documents'), 'No document request template is configured for this step.';

    elsif v_step.action_type = 'assign_user' and nullif(v_step.action_config->>'staff_id', '') is null then
      return query select v_step.display_order, v_step.action_type, coalesce(v_step.display_name, 'Assign Staff'), 'No staff member is selected for this step.';

    elsif v_step.action_type = 'move_pipeline_stage' then
      if nullif(v_step.action_config->>'process_id', '') is null or nullif(v_step.action_config->>'process_stage_id', '') is null then
        return query select v_step.display_order, v_step.action_type, coalesce(v_step.display_name, 'Move to a Pipeline Stage'), 'No target pipeline stage is selected for this step.';
      end if;

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

    elsif v_step.action_type = 'add_tag' and nullif(v_step.action_config->>'tag', '') is null
        and coalesce(case when jsonb_typeof(v_step.action_config->'tags') = 'array' then jsonb_array_length(v_step.action_config->'tags') else 0 end, 0) = 0 then
      return query select v_step.display_order, v_step.action_type, coalesce(v_step.display_name, 'Add Tag'), 'No tag is configured for this step.';

    elsif v_step.action_type = 'remove_tag' and nullif(v_step.action_config->>'tag', '') is null
        and coalesce(case when jsonb_typeof(v_step.action_config->'tags') = 'array' then jsonb_array_length(v_step.action_config->'tags') else 0 end, 0) = 0 then
      return query select v_step.display_order, v_step.action_type, coalesce(v_step.display_name, 'Remove Tag'), 'No tag is configured for this step.';

    elsif v_step.action_type = 'mark_lead_lost' and nullif(v_step.action_config->>'reason', '') is null then
      return query select v_step.display_order, v_step.action_type, coalesce(v_step.display_name, 'Mark Lead Lost'), 'No reason is configured for this step.';

    elsif v_step.action_type = 'update_client' then
      if nullif(v_step.action_config->>'field', '') is null then
        return query select v_step.display_order, v_step.action_type, coalesce(v_step.display_name, 'Update Client'), 'No field is selected to update for this step.';
      elsif nullif(v_step.action_config->>'value', '') is null then
        return query select v_step.display_order, v_step.action_type, coalesce(v_step.display_name, 'Update Client'), 'No value is set for this step -- it would clear the field instead of updating it.';
      end if;

    elsif v_step.action_type = 'add_note' and nullif(v_step.action_config->>'body', '') is null then
      return query select v_step.display_order, v_step.action_type, coalesce(v_step.display_name, 'Add Note'), 'No note text is configured for this step.';

    elsif v_step.action_type = 'send_notification' and nullif(v_step.action_config->>'message', '') is null then
      return query select v_step.display_order, v_step.action_type, coalesce(v_step.display_name, 'Notify Staff'), 'No message is configured for this step.';
    end if;
  end loop;

  return;
end;
$function$;

-- Server-side enforcement: a direct .update({is_enabled:true}) or
-- {status:'published'}, bypassing the client's own pre-flight
-- validate_automation() call, is now rejected by the database too.
create or replace function public.enforce_automation_publish_validation()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_going_live boolean;
  v_issue record;
begin
  if tg_op = 'INSERT' then
    v_going_live := coalesce(new.is_enabled, false) or new.status = 'published';
  else
    v_going_live := (coalesce(new.is_enabled, false) and not coalesce(old.is_enabled, false))
      or (new.status = 'published' and old.status is distinct from 'published');
  end if;

  if not v_going_live then
    return new;
  end if;

  select * into v_issue from public.validate_automation(new.id) limit 1;
  if found then
    raise exception 'Cannot activate or publish this workflow: %', v_issue.issue;
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_automation_publish_validation_trg on public.automations;
create trigger enforce_automation_publish_validation_trg
  after insert or update on public.automations
  for each row execute function public.enforce_automation_publish_validation();
