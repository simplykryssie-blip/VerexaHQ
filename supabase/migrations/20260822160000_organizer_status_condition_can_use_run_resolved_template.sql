-- send_organizer_template auto-detects which organizer to send from the
-- service chosen at trigger time, so a later condition step in the same
-- run (e.g. after a delay, checking "has the organizer been started") has
-- no fixed template id to point at -- it needs to ask about whichever
-- organizer THIS run actually sent. Fixed two places:
--
-- 1. execute_automation_step's send_organizer_template branch now records
--    the template id it resolved onto automation_runs.trigger_snapshot as
--    last_organizer_template_id, so it survives past this step (unlike the
--    per-call v_context, which is rebuilt from scratch on every step).
-- 2. evaluate_automation_conditions treats the sentinel template id "run"
--    (chosen in the UI as "Whichever organizer this run sent") as "look up
--    last_organizer_template_id from p_context" instead of a literal uuid.

CREATE OR REPLACE FUNCTION public.execute_automation_step(p_run_id uuid, p_step_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_run record;
  v_step record;
  v_eng record;
  v_workspace record;
  v_branding record;
  v_context jsonb;
  v_status text := 'completed';
  v_error text;
  v_response record;
  v_service record;
  v_new_engagement_id uuid;
  v_stage_id uuid;
  v_doc_request_id uuid;
  v_wf_run_id uuid;
  v_wf_run_process_id uuid;
  v_target_stage_id uuid;
  v_target_order int;
  v_current_order int;
  v_loop_guard int;
  v_thread_id uuid;
  v_new_client_id uuid;
  v_normalized_email text;
  v_normalized_phone text;
  v_quote_id uuid;
  v_child_run_id uuid;
  v_portal_user_id uuid;
  v_lead_run_id uuid;
  v_lead_run_process_id uuid;
  v_lead_stage_id uuid;
  v_channels text[];
  v_recipient record;
  v_organizer_link text;
  v_base_url text;
  v_resolved_organizer_template_id uuid;
begin
  select * into v_run from public.automation_runs where id = p_run_id;
  select * into v_step from public.automation_steps where id = p_step_id;

  if v_run.engagement_id is not null then
    select e.engagement_number, e.status, e.priority, e.service_id, c.first_name, c.last_name, c.primary_email, c.primary_phone
    into v_eng
    from public.engagements e
    left join public.clients c on c.id = e.client_id
    where e.id = v_run.engagement_id;
  elsif v_run.client_id is not null then
    select null::text as engagement_number, null::text as status, null::text as priority, null::uuid as service_id,
      c.first_name, c.last_name, c.primary_email, c.primary_phone
    into v_eng
    from public.clients c
    where c.id = v_run.client_id;
  end if;

  select name into v_workspace from public.workspaces where id = v_run.workspace_id;
  select support_phone, support_email, custom_domain into v_branding from public.branding where workspace_id = v_run.workspace_id;

  v_context := jsonb_build_object(
    'engagement_number', v_eng.engagement_number,
    'client_name', btrim(coalesce(v_eng.first_name, '') || ' ' || coalesce(v_eng.last_name, '')),
    'first_name', v_eng.first_name,
    'firm_name', v_workspace.name,
    'status', v_eng.status,
    'tax_year', (extract(year from now())::int - 1)::text,
    'office_phone', v_branding.support_phone,
    'office_email', v_branding.support_email
  );

  begin
    if v_step.action_type = 'delay' then
      null;
    elsif v_step.action_type = 'condition' then
      null;
    elsif v_step.action_type = 'send_email' then
      if v_eng.primary_email is null then
        raise exception 'Client has no email on file';
      end if;
      if nullif(v_step.action_config->>'organizer_template_id', '') is not null then
        v_base_url := 'https://' || coalesce(nullif(v_branding.custom_domain, ''), 'verexahq.com');
        select v_base_url || '/o/' || public_token::text into v_organizer_link
        from public.organizer_templates where id = (v_step.action_config->>'organizer_template_id')::uuid;
        v_context := v_context || jsonb_build_object('organizer_link', v_organizer_link);
      end if;
      insert into public.notification_queue (workspace_id, recipient_email, channel, template_key, payload, entity_type, entity_id, event_type, dedupe_key)
      values (v_run.workspace_id, v_eng.primary_email, 'Email', v_step.action_config->>'template_slug', v_context, 'engagement', v_run.engagement_id, 'automation', 'automation_step:' || p_step_id || ':' || p_run_id)
      on conflict (workspace_id, template_key, dedupe_key) where dedupe_key is not null do nothing;
    elsif v_step.action_type = 'send_sms' then
      if v_eng.primary_phone is null then
        raise exception 'Client has no phone on file';
      end if;
      if nullif(v_step.action_config->>'organizer_template_id', '') is not null then
        v_base_url := 'https://' || coalesce(nullif(v_branding.custom_domain, ''), 'verexahq.com');
        select v_base_url || '/o/' || public_token::text into v_organizer_link
        from public.organizer_templates where id = (v_step.action_config->>'organizer_template_id')::uuid;
        v_context := v_context || jsonb_build_object('organizer_link', v_organizer_link);
      end if;
      insert into public.notification_queue (workspace_id, recipient_phone, channel, template_key, payload, entity_type, entity_id, event_type, dedupe_key)
      values (v_run.workspace_id, v_eng.primary_phone, 'SMS', v_step.action_config->>'template_slug', v_context, 'engagement', v_run.engagement_id, 'automation', 'automation_step:' || p_step_id || ':' || p_run_id)
      on conflict (workspace_id, template_key, dedupe_key) where dedupe_key is not null do nothing;
    elsif v_step.action_type = 'create_task' then
      if v_run.engagement_id is null and v_run.client_id is null then
        raise exception 'This workflow run has no engagement or client to attach a task to';
      end if;
      insert into public.tasks (workspace_id, engagement_id, client_id, title, description, assigned_staff_id, due_date, priority)
      values (
        v_run.workspace_id, v_run.engagement_id, case when v_run.engagement_id is null then v_run.client_id else null end,
        coalesce(v_step.action_config->>'title', 'Automated task'),
        v_step.action_config->>'description',
        nullif(v_step.action_config->>'assigned_staff_id', '')::uuid,
        case when v_step.action_config ? 'due_in_days' then now() + make_interval(days => (v_step.action_config->>'due_in_days')::int) else null end,
        coalesce(v_step.action_config->>'priority', 'medium')
      );
    elsif v_step.action_type = 'send_organizer_template' then
      if v_run.client_id is null then
        raise exception 'This workflow run has no client to send an organizer to';
      end if;

      v_resolved_organizer_template_id := coalesce(
        nullif(v_step.action_config->>'organizer_template_id', '')::uuid,
        (
          select ot.id
          from public.services s
          join public.organizer_templates svc_ot on svc_ot.id = s.organizer_template_id
          join public.organizer_templates ot
            on ot.slug = svc_ot.slug
            and ot.workspace_id = v_run.workspace_id
          where s.id = nullif(v_run.trigger_snapshot->>'service_id', '')::uuid
          limit 1
        )
      );

      insert into public.organizer_responses (workspace_id, client_id, engagement_id, organizer_template_id)
      values (v_run.workspace_id, v_run.client_id, v_run.engagement_id, v_resolved_organizer_template_id);

      if v_resolved_organizer_template_id is not null then
        update public.automation_runs
        set trigger_snapshot = coalesce(trigger_snapshot, '{}'::jsonb) || jsonb_build_object('last_organizer_template_id', v_resolved_organizer_template_id)
        where id = p_run_id;
      end if;
    elsif v_step.action_type = 'create_engagement' then
      if v_run.client_id is null then
        raise exception 'This workflow run has no client to create an engagement for';
      end if;
      if v_run.trigger_snapshot->>'response_id' is null then
        raise exception 'This action only works on a run triggered by an organizer submission';
      end if;

      select id, resolved_service_id, needs_service_review into v_response
      from public.organizer_responses where id = (v_run.trigger_snapshot->>'response_id')::uuid;

      if v_response.id is null or v_response.needs_service_review or v_response.resolved_service_id is null then
        raise exception 'The organizer response needs a service manually resolved before an engagement can be created';
      end if;

      select id, process_id into v_service from public.services where id = v_response.resolved_service_id;

      insert into public.engagements (workspace_id, client_id, service_id, workflow_id)
      values (v_run.workspace_id, v_run.client_id, v_service.id, v_service.process_id)
      returning id into v_new_engagement_id;

      if v_service.process_id is not null then
        perform public.start_engagement_workflow(v_new_engagement_id, v_service.process_id);
      end if;
    elsif v_step.action_type = 'send_engagement_letter' then
      if v_run.engagement_id is null then
        raise exception 'This workflow run has no engagement to send an engagement letter for';
      end if;
      if v_run.client_id is null then
        raise exception 'This workflow run has no client to send an engagement letter to';
      end if;
      if nullif(v_step.action_config->>'engagement_letter_template_id', '') is null then
        raise exception 'No engagement letter template configured for this step';
      end if;

      insert into public.pending_engagement_letter_sends (workspace_id, engagement_id, client_id, engagement_letter_template_id)
      values (v_run.workspace_id, v_run.engagement_id, v_run.client_id, (v_step.action_config->>'engagement_letter_template_id')::uuid);
    elsif v_step.action_type = 'change_stage' then
      if v_run.engagement_id is not null then
        select ws.id into v_stage_id
        from public.workflow_runs wr
        join public.workflow_stages ws on ws.id = wr.current_stage_id
        where wr.engagement_id = v_run.engagement_id and wr.status = 'Active';

        if v_stage_id is null then
          raise exception 'This engagement has no active pipeline stage to advance';
        end if;

        update public.workflow_stages set status = 'Completed', completed_at = now() where id = v_stage_id;
      elsif v_run.client_id is not null then
        select lr.current_stage_id into v_lead_stage_id
        from public.lead_pipeline_runs lr
        where lr.client_id = v_run.client_id and lr.status = 'Active';

        if v_lead_stage_id is null then
          raise exception 'This lead has no active pipeline stage to advance';
        end if;

        update public.lead_pipeline_stages set status = 'Completed', completed_at = now() where id = v_lead_stage_id;
      else
        raise exception 'This workflow run has no engagement or client to advance';
      end if;
    elsif v_step.action_type = 'send_document_request' then
      if v_run.engagement_id is null then
        raise exception 'This workflow run has no engagement to attach a document request to';
      end if;
      if nullif(v_step.action_config->>'document_request_template_id', '') is null then
        raise exception 'No document request template configured for this step';
      end if;

      insert into public.document_requests (workspace_id, entity_type, entity_id, document_request_template_id, title, due_date)
      values (
        v_run.workspace_id, 'engagement', v_run.engagement_id,
        (v_step.action_config->>'document_request_template_id')::uuid,
        coalesce(v_step.action_config->>'title', 'Requested documents'),
        case when v_step.action_config ? 'due_in_days' then (now() + make_interval(days => (v_step.action_config->>'due_in_days')::int))::date else null end
      )
      returning id into v_doc_request_id;

      insert into public.document_request_item_statuses (document_request_id, document_request_item_id, name, is_required, status, fulfilled_by_attachment_id)
      select
        v_doc_request_id, dri.id, dri.name, dri.is_required,
        coalesce(prior.status, 'pending'), prior.fulfilled_by_attachment_id
      from public.document_request_items dri
      left join lateral (
        select s.status, s.fulfilled_by_attachment_id
        from public.document_request_item_statuses s
        join public.document_requests r on r.id = s.document_request_id
        where r.entity_type = 'engagement' and r.entity_id = v_run.engagement_id
          and s.name = dri.name and s.status <> 'pending'
        order by s.updated_at desc
        limit 1
      ) prior on true
      where dri.document_request_template_id = (v_step.action_config->>'document_request_template_id')::uuid;

    elsif v_step.action_type = 'assign_user' then
      if nullif(v_step.action_config->>'staff_id', '') is null then
        raise exception 'No staff member configured for this step';
      end if;
      if coalesce(v_step.action_config->>'target', case when v_run.engagement_id is not null then 'engagement' else 'client' end) = 'client' then
        if v_run.client_id is null then
          raise exception 'This workflow run has no client to assign';
        end if;
        update public.clients set relationship_manager_id = (v_step.action_config->>'staff_id')::uuid where id = v_run.client_id;
      else
        if v_run.engagement_id is null then
          raise exception 'This workflow run has no engagement to assign';
        end if;
        update public.engagements set assigned_staff_id = (v_step.action_config->>'staff_id')::uuid where id = v_run.engagement_id;
      end if;

    elsif v_step.action_type = 'send_notification' then
      v_channels := coalesce(
        (select array_agg(value #>> '{}') from jsonb_array_elements(v_step.action_config->'channels')),
        array['In-App']
      );

      for v_recipient in
        select wu.user_id, u.email
        from public.workspace_users wu
        join auth.users u on u.id = wu.user_id
        where wu.workspace_id = v_run.workspace_id and wu.status = 'active'
      loop
        if 'In-App' = any(v_channels) then
          perform public.create_notification(
            v_run.workspace_id,
            v_recipient.user_id,
            'automation',
            coalesce(nullif(v_step.action_config->>'template_key', ''), 'automation-step'),
            v_context || jsonb_build_object('message', v_step.action_config->>'message'),
            array['In-App'],
            coalesce(nullif(v_step.action_config->>'priority', ''), 'Medium'),
            case when v_run.engagement_id is not null then 'engagement' else 'client' end,
            coalesce(v_run.engagement_id, v_run.client_id)
          );
        end if;

        if 'Email' = any(v_channels) and v_recipient.email is not null then
          insert into public.notification_queue (workspace_id, recipient_user_id, recipient_email, channel, template_key, payload, priority, entity_type, entity_id)
          values (
            v_run.workspace_id, v_recipient.user_id, v_recipient.email, 'Email', 'automation-staff-notification',
            v_context || jsonb_build_object('message', v_step.action_config->>'message'),
            coalesce(nullif(v_step.action_config->>'priority', ''), 'Medium'),
            case when v_run.engagement_id is not null then 'engagement' else 'client' end,
            coalesce(v_run.engagement_id, v_run.client_id)
          );
        end if;
      end loop;

    elsif v_step.action_type = 'move_lead_stage' then
      if v_run.client_id is null then
        raise exception 'This workflow run has no client to move';
      end if;
      if nullif(v_step.action_config->>'process_id', '') is null or nullif(v_step.action_config->>'process_stage_id', '') is null then
        raise exception 'No target pipeline stage configured for this step';
      end if;

      select id, process_id, current_stage_id into v_lead_run_id, v_lead_run_process_id, v_lead_stage_id
      from public.lead_pipeline_runs
      where client_id = v_run.client_id and status = 'Active';

      if v_lead_run_id is null then
        v_lead_run_id := public.start_lead_pipeline_run(v_run.client_id, (v_step.action_config->>'process_id')::uuid);
        select current_stage_id into v_lead_stage_id from public.lead_pipeline_runs where id = v_lead_run_id;
      elsif v_lead_run_process_id is distinct from (v_step.action_config->>'process_id')::uuid then
        raise exception 'This lead is already in a different pipeline';
      end if;

      select id into v_target_stage_id from public.lead_pipeline_stages
      where lead_pipeline_run_id = v_lead_run_id and process_stage_id = (v_step.action_config->>'process_stage_id')::uuid;

      if v_target_stage_id is null then
        raise exception 'Target stage is not part of this lead''s pipeline';
      end if;

      select display_order into v_target_order from public.lead_pipeline_stages where id = v_target_stage_id;
      select display_order into v_current_order from public.lead_pipeline_stages where id = v_lead_stage_id;

      if v_target_order < v_current_order then
        raise exception 'Moving a lead backward through pipeline stages is not supported by this action';
      end if;

      v_loop_guard := 0;
      while v_lead_stage_id is distinct from v_target_stage_id and v_loop_guard < 100 loop
        update public.lead_pipeline_stages set status = 'Completed', completed_at = now() where id = v_lead_stage_id;
        select current_stage_id into v_lead_stage_id from public.lead_pipeline_runs where id = v_lead_run_id;
        v_loop_guard := v_loop_guard + 1;
      end loop;

    elsif v_step.action_type = 'mark_lead_lost' then
      if v_run.client_id is null then
        raise exception 'This workflow run has no client to mark lost';
      end if;
      update public.clients set lifecycle_status = 'lost', lost_reason = v_step.action_config->>'reason' where id = v_run.client_id;

    elsif v_step.action_type = 'convert_lead_to_client' then
      if v_run.client_id is null then
        raise exception 'This workflow run has no client to convert';
      end if;
      update public.clients set lifecycle_status = 'active' where id = v_run.client_id;

    elsif v_step.action_type = 'update_client' then
      if v_run.client_id is null then
        raise exception 'This workflow run has no client to update';
      end if;
      if v_step.action_config->>'field' = 'first_name' then
        update public.clients set first_name = v_step.action_config->>'value' where id = v_run.client_id;
      elsif v_step.action_config->>'field' = 'last_name' then
        update public.clients set last_name = v_step.action_config->>'value' where id = v_run.client_id;
      elsif v_step.action_config->>'field' = 'primary_phone' then
        update public.clients
        set primary_phone = v_step.action_config->>'value',
            normalized_phone = nullif(regexp_replace(coalesce(v_step.action_config->>'value', ''), '\D', '', 'g'), '')
        where id = v_run.client_id;
      elsif v_step.action_config->>'field' = 'relationship_manager_id' then
        update public.clients set relationship_manager_id = nullif(v_step.action_config->>'value', '')::uuid where id = v_run.client_id;
      else
        raise exception 'Unsupported field for update_client: %', v_step.action_config->>'field';
      end if;

    elsif v_step.action_type = 'create_client' then
      v_normalized_email := nullif(lower(btrim(v_step.action_config->>'primary_email')), '');
      v_normalized_phone := nullif(regexp_replace(coalesce(v_step.action_config->>'primary_phone', ''), '\D', '', 'g'), '');

      select id into v_new_client_id
      from public.clients
      where workspace_id = v_run.workspace_id
        and merged_into_client_id is null
        and (
          (v_normalized_email is not null and normalized_email = v_normalized_email)
          or (v_normalized_phone is not null and normalized_phone = v_normalized_phone)
        )
      limit 1;

      if v_new_client_id is null then
        insert into public.clients (workspace_id, client_type, first_name, last_name, primary_email, primary_phone, normalized_email, normalized_phone, lifecycle_status)
        values (
          v_run.workspace_id,
          coalesce(nullif(v_step.action_config->>'client_type', ''), 'individual'),
          v_step.action_config->>'first_name',
          v_step.action_config->>'last_name',
          v_step.action_config->>'primary_email',
          v_step.action_config->>'primary_phone',
          v_normalized_email,
          v_normalized_phone,
          coalesce(nullif(v_step.action_config->>'lifecycle_status', ''), 'lead')
        )
        returning id into v_new_client_id;
      end if;

    elsif v_step.action_type = 'move_engagement_stage' then
      if v_run.engagement_id is null then
        raise exception 'This workflow run has no engagement to move a stage for';
      end if;
      if nullif(v_step.action_config->>'process_stage_id', '') is null then
        raise exception 'No target stage configured for this step';
      end if;

      select wr.id, wr.process_id, wr.current_stage_id into v_wf_run_id, v_wf_run_process_id, v_stage_id
      from public.workflow_runs wr
      where wr.engagement_id = v_run.engagement_id and wr.status = 'Active';

      if v_wf_run_id is null then
        if nullif(v_step.action_config->>'process_id', '') is null then
          raise exception 'This engagement has no active pipeline yet -- choose a pipeline for this step to start one';
        end if;
        v_wf_run_id := public.start_engagement_workflow(v_run.engagement_id, (v_step.action_config->>'process_id')::uuid);
        update public.engagements set workflow_id = (v_step.action_config->>'process_id')::uuid where id = v_run.engagement_id;
        select current_stage_id into v_stage_id from public.workflow_runs where id = v_wf_run_id;
      elsif nullif(v_step.action_config->>'process_id', '') is not null
            and v_wf_run_process_id is distinct from (v_step.action_config->>'process_id')::uuid then
        raise exception 'This engagement is already on a different pipeline';
      end if;

      select ws.id, ws.display_order into v_target_stage_id, v_target_order
      from public.workflow_stages ws
      where ws.workflow_run_id = v_wf_run_id and ws.process_stage_id = (v_step.action_config->>'process_stage_id')::uuid;

      if v_target_stage_id is null then
        raise exception 'Target stage is not part of this engagement''s pipeline';
      end if;

      select display_order into v_current_order from public.workflow_stages where id = v_stage_id;

      if v_target_order < v_current_order then
        raise exception 'Moving an engagement backward through pipeline stages is not supported by this action';
      end if;

      v_loop_guard := 0;
      while v_stage_id is distinct from v_target_stage_id and v_loop_guard < 100 loop
        update public.workflow_stages set status = 'Completed', completed_at = now() where id = v_stage_id;
        select current_stage_id into v_stage_id from public.workflow_runs where id = v_wf_run_id;
        v_loop_guard := v_loop_guard + 1;
      end loop;

    elsif v_step.action_type = 'create_quote' then
      if v_run.client_id is null then
        raise exception 'This workflow run has no client to quote';
      end if;
      insert into public.quotes (workspace_id, client_id, engagement_id, service_id, title, subtotal, tax_amount, discount_amount, total_amount, valid_until, notes)
      values (
        v_run.workspace_id, v_run.client_id, v_run.engagement_id,
        nullif(v_step.action_config->>'service_id', '')::uuid,
        coalesce(v_step.action_config->>'title', 'Quote'),
        coalesce((v_step.action_config->>'subtotal')::numeric, 0),
        coalesce((v_step.action_config->>'tax_amount')::numeric, 0),
        coalesce((v_step.action_config->>'discount_amount')::numeric, 0),
        coalesce((v_step.action_config->>'total_amount')::numeric, coalesce((v_step.action_config->>'subtotal')::numeric, 0)),
        nullif(v_step.action_config->>'valid_until', '')::date,
        v_step.action_config->>'notes'
      );

    elsif v_step.action_type = 'send_quote' then
      select id into v_quote_id from public.quotes
      where workspace_id = v_run.workspace_id
        and client_id = v_run.client_id
        and status = 'draft'
      order by created_at desc
      limit 1;

      if v_quote_id is null then
        raise exception 'No draft quote found to send for this client';
      end if;

      update public.quotes set status = 'sent' where id = v_quote_id;

    elsif v_step.action_type = 'add_tag' then
      if v_run.client_id is null then
        raise exception 'This workflow run has no client to tag';
      end if;
      if nullif(v_step.action_config->>'tag', '') is null then
        raise exception 'No tag configured for this step';
      end if;
      update public.clients
      set tags = array(select distinct unnest(coalesce(tags, '{}') || array[v_step.action_config->>'tag']))
      where id = v_run.client_id;

    elsif v_step.action_type = 'remove_tag' then
      if v_run.client_id is null then
        raise exception 'This workflow run has no client to untag';
      end if;
      update public.clients
      set tags = array_remove(coalesce(tags, '{}'), v_step.action_config->>'tag')
      where id = v_run.client_id;

    elsif v_step.action_type = 'add_note' then
      if v_run.engagement_id is null and v_run.client_id is null then
        raise exception 'This workflow run has no entity to attach a note to';
      end if;
      insert into public.notes (workspace_id, entity_type, entity_id, body, is_internal)
      values (
        v_run.workspace_id,
        case when v_run.engagement_id is not null then 'engagement' else 'client' end,
        coalesce(v_run.engagement_id, v_run.client_id),
        coalesce(v_step.action_config->>'body', ''),
        true
      );

    elsif v_step.action_type = 'send_portal_message' then
      if v_run.client_id is null then
        raise exception 'This workflow run has no client to message';
      end if;
      if nullif(v_step.action_config->>'body', '') is null then
        raise exception 'No message body configured for this step';
      end if;

      select id into v_thread_id from public.message_threads
      where workspace_id = v_run.workspace_id and entity_type = 'client' and entity_id = v_run.client_id and status = 'open'
      order by coalesce(last_message_at, created_at) desc
      limit 1;

      if v_thread_id is null then
        insert into public.message_threads (workspace_id, entity_type, entity_id, subject, channel)
        values (v_run.workspace_id, 'client', v_run.client_id, coalesce(v_step.action_config->>'subject', 'Message from your accountant'), 'portal')
        returning id into v_thread_id;
      end if;

      insert into public.messages (workspace_id, thread_id, sender_type, is_internal, body)
      values (v_run.workspace_id, v_thread_id, 'staff', false, v_step.action_config->>'body');

      update public.message_threads set last_message_at = now() where id = v_thread_id;

    elsif v_step.action_type = 'invite_to_portal' then
      if v_run.client_id is null then
        raise exception 'This workflow run has no client to invite';
      end if;

      if not exists (select 1 from public.client_portal_users where client_id = v_run.client_id) then
        if v_eng.primary_email is null then
          raise exception 'Client has no email on file to invite';
        end if;

        insert into public.client_portal_users (client_id, workspace_id, invited_email, invited_name)
        values (v_run.client_id, v_run.workspace_id, v_eng.primary_email, btrim(coalesce(v_eng.first_name, '') || ' ' || coalesce(v_eng.last_name, '')))
        returning id into v_portal_user_id;

        insert into public.pending_portal_invites (workspace_id, client_id, client_portal_user_id)
        values (v_run.workspace_id, v_run.client_id, v_portal_user_id);
      end if;

    elsif v_step.action_type = 'start_workflow' then
      if nullif(v_step.action_config->>'automation_id', '') is null then
        raise exception 'No automation configured for this step';
      end if;
      if not exists (
        select 1 from public.automations
        where id = (v_step.action_config->>'automation_id')::uuid
          and workspace_id = v_run.workspace_id and is_enabled = true and status = 'published'
      ) then
        raise exception 'Target automation is not available to start';
      end if;

      insert into public.automation_runs (workspace_id, automation_id, engagement_id, client_id, trigger_snapshot, status)
      values (v_run.workspace_id, (v_step.action_config->>'automation_id')::uuid, v_run.engagement_id, v_run.client_id, v_run.trigger_snapshot, 'running')
      returning id into v_child_run_id;
      perform public.start_next_automation_step(v_child_run_id);

    elsif v_step.action_type = 'end_workflow' then
      update public.automation_runs set status = 'completed', completed_at = now() where id = p_run_id;

    else
      raise exception 'Action type % is not yet supported', v_step.action_type;
    end if;
  exception when others then
    v_status := 'failed';
    v_error := sqlerrm;
  end;

  insert into public.automation_execution_logs (workspace_id, automation_id, engagement_id, status, execution_data, error_message, executed_at)
  values (
    v_run.workspace_id, v_run.automation_id, v_run.engagement_id, v_status,
    jsonb_build_object('step_id', p_step_id, 'action_type', v_step.action_type, 'run_id', p_run_id),
    v_error, now()
  );

  if v_status = 'failed' then
    update public.automation_runs set status = 'failed', completed_at = now() where id = p_run_id;
  else
    perform public.start_next_automation_step(p_run_id);
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.evaluate_automation_conditions(p_conditions jsonb, p_context jsonb, p_workspace_id uuid, p_client_id uuid, p_engagement_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
declare
  v_cond jsonb;
  v_field text;
  v_op text;
  v_join text;
  v_expected text;
  v_actual text;
  v_client record;
  v_engagement record;
  v_interest record;
  v_portal record;
  v_quote record;
  v_task record;
  v_doc_request record;
  v_process_id uuid;
  v_process_stage_id uuid;
  v_lead_process_stage_id uuid;
  v_org_template_id_raw text;
  v_org_template_id uuid;
  v_org_expected_status text;
  v_org_actual_status text;
  v_match boolean;
  v_result boolean;
  v_index int := 0;
begin
  if p_conditions is null or jsonb_array_length(p_conditions) = 0 then
    return true;
  end if;

  select * into v_client from public.clients where id = p_client_id;
  select * into v_interest from public.client_service_interests where client_id = p_client_id order by created_at desc limit 1;
  select * into v_portal from public.client_portal_users where client_id = p_client_id order by invited_at desc limit 1;
  select * into v_engagement from public.engagements where id = p_engagement_id;
  select wr.process_id, ws.process_stage_id into v_process_id, v_process_stage_id
  from public.workflow_runs wr
  join public.workflow_stages ws on ws.id = wr.current_stage_id
  where wr.engagement_id = p_engagement_id and wr.status = 'Active';
  select lps.process_stage_id into v_lead_process_stage_id
  from public.lead_pipeline_runs lr
  join public.lead_pipeline_stages lps on lps.id = lr.current_stage_id
  where lr.client_id = p_client_id and lr.status = 'Active';
  select * into v_quote from public.quotes
  where (p_engagement_id is not null and engagement_id = p_engagement_id)
     or (p_client_id is not null and client_id = p_client_id)
  order by created_at desc limit 1;
  select * into v_task from public.tasks where id = nullif(p_context->>'task_id', '')::uuid;
  select * into v_doc_request from public.document_requests where id = nullif(p_context->>'document_request_id', '')::uuid;

  for v_cond in select * from jsonb_array_elements(p_conditions)
  loop
    v_index := v_index + 1;
    v_field := v_cond->>'field';
    v_op := coalesce(v_cond->>'op', 'eq');
    v_join := coalesce(v_cond->>'join', 'and');
    v_expected := v_cond->>'value';

    if v_field = 'client.tags' then
      v_match := v_expected = any(coalesce(v_client.tags, '{}'::text[]));
      if v_op = 'neq' then
        v_match := not v_match;
      end if;
    elsif v_field = 'document_request.all_required_complete' then
      v_match := (coalesce(v_expected, 'true') = 'true') = not exists (
        select 1 from public.document_request_item_statuses
        where document_request_id = coalesce((p_context->>'document_request_id')::uuid, v_doc_request.id)
          and is_required = true and status = 'pending'
      );
    elsif v_field = 'client.organizer_status' then
      -- value is "<organizer_template_id>|<status>" -- template id may
      -- instead be the sentinel "run", meaning "whichever organizer this
      -- automation run itself sent" (recorded by the send_organizer_template
      -- step onto automation_runs.trigger_snapshot as last_organizer_template_id,
      -- which is how p_context is fed here). That's the only way to check this
      -- when the organizer is auto-detected per service rather than fixed.
      v_org_template_id_raw := split_part(coalesce(v_expected, ''), '|', 1);
      v_org_expected_status := split_part(coalesce(v_expected, ''), '|', 2);
      v_org_template_id := case
        when v_org_template_id_raw = 'run' then nullif(p_context->>'last_organizer_template_id', '')::uuid
        else nullif(v_org_template_id_raw, '')::uuid
      end;
      select status into v_org_actual_status
      from public.organizer_responses
      where client_id = p_client_id and organizer_template_id = v_org_template_id
      order by created_at desc limit 1;
      v_org_actual_status := coalesce(v_org_actual_status, 'not_sent');
      if v_op = 'neq' then
        v_match := v_org_actual_status is distinct from v_org_expected_status;
      else
        v_match := v_org_actual_status is not distinct from v_org_expected_status;
      end if;
    else
      v_actual := case v_field
        when 'client.lifecycle_status' then v_client.lifecycle_status
        when 'client.client_type' then v_client.client_type
        when 'client.relationship_manager_id' then v_client.relationship_manager_id::text
        when 'client.service_category_id' then v_interest.service_category_id::text
        when 'client.service_id' then v_interest.service_id::text
        when 'client.source' then v_interest.source
        when 'client.portal_status' then coalesce(v_portal.status, 'not_sent')
        when 'lead.process_stage_id' then v_lead_process_stage_id::text
        when 'engagement.status' then v_engagement.status
        when 'engagement.priority' then v_engagement.priority::text
        when 'engagement.case_type' then v_engagement.case_type
        when 'engagement.service_id' then v_engagement.service_id::text
        when 'engagement.assigned_staff_id' then v_engagement.assigned_staff_id::text
        when 'engagement.reviewer_id' then v_engagement.reviewer_id::text
        when 'engagement.process_id' then v_process_id::text
        when 'engagement.process_stage_id' then v_process_stage_id::text
        when 'quote.status' then v_quote.status
        when 'quote.total_amount' then v_quote.total_amount::text
        when 'task.status' then v_task.status
        when 'task.assigned_staff_id' then v_task.assigned_staff_id::text
        when 'task.overdue' then (v_task.due_date is not null and v_task.due_date < now() and v_task.status <> 'completed')::text
        when 'document_request.status' then v_doc_request.status
        else p_context ->> v_field
      end;

      if v_op = 'eq' then
        v_match := v_actual is not distinct from v_expected;
      elsif v_op = 'neq' then
        v_match := v_actual is distinct from v_expected;
      elsif v_op = 'in' then
        v_match := v_actual = any(string_to_array(coalesce(v_expected, ''), ','));
      elsif v_op = 'not_in' then
        v_match := v_actual is not null and not (v_actual = any(string_to_array(coalesce(v_expected, ''), ',')));
      elsif v_op = 'gt' then
        v_match := v_actual is not null and v_expected is not null and v_actual::numeric > v_expected::numeric;
      elsif v_op = 'gte' then
        v_match := v_actual is not null and v_expected is not null and v_actual::numeric >= v_expected::numeric;
      elsif v_op = 'lt' then
        v_match := v_actual is not null and v_expected is not null and v_actual::numeric < v_expected::numeric;
      elsif v_op = 'lte' then
        v_match := v_actual is not null and v_expected is not null and v_actual::numeric <= v_expected::numeric;
      elsif v_op = 'is_null' then
        v_match := v_actual is null;
      elsif v_op = 'is_not_null' then
        v_match := v_actual is not null;
      else
        v_match := true;
      end if;
    end if;

    if v_index = 1 then
      v_result := v_match;
    elsif v_join = 'or' then
      v_result := v_result or v_match;
    else
      v_result := v_result and v_match;
    end if;
  end loop;

  return v_result;
end;
$function$;
