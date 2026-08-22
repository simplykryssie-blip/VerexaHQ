-- Gap #5 from the GHL capability audit: no way for an external system
-- (Calendly, Zapier, a marketing-site form) to start a workflow, and no way
-- for a workflow to push data out to one. The 'webhook' action_type has sat
-- unused in the action_type check constraint since early in this project --
-- this is the first real implementation of it, plus the inbound half.

-- Inbound: every automation gets a stable, unguessable token identifying it
-- to the public webhook receiver route. Harmless when trigger_type isn't
-- 'webhook.received' -- the route checks that before honoring anything.
alter table public.automations add column webhook_token uuid not null default gen_random_uuid();
create unique index automations_webhook_token_idx on public.automations (webhook_token);

-- Outbound: execute_automation_step is pure SQL and can't make an HTTP
-- request itself (the same reason send_email/send_sms only enqueue into
-- notification_queue rather than calling Resend/Twilio directly) -- a new
-- cron route drains this the same way dispatch-notifications drains
-- notification_queue, actually performing the fetch().
create table public.automation_webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  run_id uuid references public.automation_runs(id) on delete cascade,
  url text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  attempts int not null default 0,
  last_error text,
  next_attempt_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index automation_webhook_deliveries_pending_idx on public.automation_webhook_deliveries (next_attempt_at) where status = 'pending';

alter table public.automation_webhook_deliveries enable row level security;

create policy automation_webhook_deliveries_select on public.automation_webhook_deliveries
  for select using (public.is_workspace_member(workspace_id));

-- execute_automation_step gains the webhook branch (enqueue only -- the
-- cron route above performs the actual delivery).
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
  v_assign_target text;
  v_assignment_mode text;
  v_resolved_staff_id uuid;
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
    elsif v_step.action_type = 'webhook' then
      if nullif(v_step.action_config->>'url', '') is null then
        raise exception 'No URL configured for this step';
      end if;
      insert into public.automation_webhook_deliveries (workspace_id, run_id, url, payload)
      values (
        v_run.workspace_id, p_run_id, v_step.action_config->>'url',
        v_context || jsonb_build_object('trigger', v_run.trigger_snapshot)
      );
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
      v_assign_target := coalesce(v_step.action_config->>'target', case when v_run.engagement_id is not null then 'engagement' else 'client' end);
      v_assignment_mode := coalesce(v_step.action_config->>'assignment_mode', 'fixed');

      if v_assignment_mode = 'round_robin' then
        if v_assign_target = 'client' then
          select wu.user_id into v_resolved_staff_id
          from public.workspace_users wu
          where wu.workspace_id = v_run.workspace_id and wu.status = 'active'
            and (
              not (v_step.action_config ? 'staff_pool') or jsonb_array_length(v_step.action_config->'staff_pool') = 0
              or wu.user_id::text in (select jsonb_array_elements_text(v_step.action_config->'staff_pool'))
            )
          order by (
            select count(*) from public.clients c2
            where c2.relationship_manager_id = wu.user_id and c2.lifecycle_status not in ('archived', 'lost')
          ) asc, random()
          limit 1;
        else
          select wu.user_id into v_resolved_staff_id
          from public.workspace_users wu
          where wu.workspace_id = v_run.workspace_id and wu.status = 'active'
            and (
              not (v_step.action_config ? 'staff_pool') or jsonb_array_length(v_step.action_config->'staff_pool') = 0
              or wu.user_id::text in (select jsonb_array_elements_text(v_step.action_config->'staff_pool'))
            )
          order by (
            select count(*) from public.engagements e2
            where e2.assigned_staff_id = wu.user_id and e2.status not in ('Completed', 'Archived')
          ) asc, random()
          limit 1;
        end if;
        if v_resolved_staff_id is null then
          raise exception 'No eligible staff member found for round-robin assignment';
        end if;
      else
        v_resolved_staff_id := nullif(v_step.action_config->>'staff_id', '')::uuid;
        if v_resolved_staff_id is null then
          raise exception 'No staff member configured for this step';
        end if;
      end if;

      if v_assign_target = 'client' then
        if v_run.client_id is null then
          raise exception 'This workflow run has no client to assign';
        end if;
        update public.clients set relationship_manager_id = v_resolved_staff_id where id = v_run.client_id;
      else
        if v_run.engagement_id is null then
          raise exception 'This workflow run has no engagement to assign';
        end if;
        update public.engagements set assigned_staff_id = v_resolved_staff_id where id = v_run.engagement_id;
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
