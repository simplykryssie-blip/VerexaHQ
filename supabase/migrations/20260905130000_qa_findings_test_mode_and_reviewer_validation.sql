-- Fixes for four defects found by the QA agent's golden-path run against
-- the Summit Tax & Financial Services demo workspace (run
-- 88747a45-43b7-4df9-ab29-1eada31a8266):
--
-- 1. send_organizer_template had no is_test check, unlike every other
--    client-facing action type -- "Run test" on a workflow containing this
--    step created a real, live organizer_responses row for the picked
--    client, contradicting test mode's "nothing goes out to the client"
--    promise.
-- 2. run_automation_test hardcoded trigger_snapshot to {"test_mode": true}
--    instead of the fields a live trigger would actually populate. Besides
--    making condition-step testing unfaithful, this made create_engagement
--    steps (which require trigger_snapshot->>'response_id') always fail
--    when tested, even against a client who has a real submitted organizer.
-- 3. (fixed in app/api/cron/run-pending-automation-steps/route.ts, not
--    here) the cron that advances due delayed steps never checked whether
--    the run it belonged to was still 'running' before executing it.
-- 4. firm_connections.default_reviewer_id had no check that the chosen
--    reviewer is actually a member of the ERO (parent) workspace -- the
--    column was written by a plain client-side table update gated only on
--    is_workspace_admin(parent_workspace_id).

-- ---------------------------------------------------------------------
-- Fix 1: is_test guard for send_organizer_template, plus a defensive
-- run.status = 'running' check at the top (belt-and-suspenders alongside
-- the cron fix for #3 -- this function is service_role-only today, but
-- nothing stops that from changing later).
-- ---------------------------------------------------------------------
create or replace function public.execute_automation_step(p_run_id uuid, p_step_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_run record;
  v_step record;
  v_eng record;
  v_workspace record;
  v_branding record;
  v_context jsonb;
  v_status text := 'completed';
  v_error text;
  v_skip_note text;
  v_response record;
  v_service record;
  v_new_engagement_id uuid;
  v_doc_request_id uuid;
  v_doc_request_entity_type text;
  v_doc_request_entity_id uuid;
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
  v_channels text[];
  v_recipient record;
  v_organizer_link text;
  v_base_url text;
  v_resolved_organizer_template_id uuid;
  v_assign_target text;
  v_assignment_mode text;
  v_resolved_staff_id uuid;
  v_appointment_start timestamptz;
  v_appointment_end timestamptz;
  v_dnd_channel text;
  v_resolved_service_id uuid;
  v_target_process_id uuid;
  v_link_template_id_raw text;
  v_pipeline_entity_type text;
  v_pipeline_entity_id uuid;
  v_pipeline_run_id uuid;
  v_pipeline_stage_id uuid;
  v_rendered_message text;
  v_close_stage_id uuid;
begin
  select * into v_run from public.automation_runs where id = p_run_id;
  select * into v_step from public.automation_steps where id = p_step_id;

  if v_run.status <> 'running' then
    return;
  end if;

  if v_run.engagement_id is not null then
    select e.engagement_number, e.status, e.priority, e.service_id, c.first_name, c.last_name, c.primary_email, c.primary_phone,
      c.sms_opt_out, c.email_opt_out, c.relationship_manager_id
    into v_eng
    from public.engagements e
    left join public.clients c on c.id = e.client_id
    where e.id = v_run.engagement_id;
  elsif v_run.client_id is not null then
    select null::text as engagement_number, null::text as status, null::text as priority, null::uuid as service_id,
      c.first_name, c.last_name, c.primary_email, c.primary_phone, c.sms_opt_out, c.email_opt_out, c.relationship_manager_id
    into v_eng
    from public.clients c
    where c.id = v_run.client_id;
  end if;

  select name, timezone into v_workspace from public.workspaces where id = v_run.workspace_id;
  select support_phone, support_email, custom_domain into v_branding from public.branding where workspace_id = v_run.workspace_id;

  v_context := jsonb_build_object(
    'engagement_number', v_eng.engagement_number,
    'client_name', btrim(coalesce(v_eng.first_name, '') || ' ' || coalesce(v_eng.last_name, '')),
    'first_name', v_eng.first_name,
    'firm_name', v_workspace.name,
    'status', v_eng.status,
    'tax_year', (extract(year from now())::int - 1)::text,
    'office_phone', v_branding.support_phone,
    'office_email', v_branding.support_email,
    'portal_link', 'https://verexahq.com/portal/login'
  );

  begin
    if v_step.action_type = 'delay' then
      null;
    elsif v_step.action_type = 'business_hours_delay' then
      null;
    elsif v_step.action_type = 'condition' then
      null;
    elsif v_step.action_type = 'webhook' then
      if nullif(v_step.action_config->>'url', '') is null then
        raise exception 'No URL configured for this step';
      end if;
      if v_run.is_test then
        v_skip_note := 'test mode -- would call webhook ' || (v_step.action_config->>'url');
      else
        insert into public.automation_webhook_deliveries (workspace_id, run_id, url, payload)
        values (
          v_run.workspace_id, p_run_id, v_step.action_config->>'url',
          v_context || jsonb_build_object('trigger', v_run.trigger_snapshot)
        );
      end if;
    elsif v_step.action_type = 'send_email' then
      if v_eng.primary_email is null then
        raise exception 'Client has no email on file';
      end if;
      if v_run.is_test then
        v_skip_note := 'test mode -- would email ' || v_eng.primary_email;
      elsif v_eng.email_opt_out then
        v_skip_note := 'client has opted out of email';
      else
        v_link_template_id_raw := nullif(v_step.action_config->>'organizer_template_id', '');
        if v_link_template_id_raw is not null then
          v_resolved_organizer_template_id := case
            when v_link_template_id_raw = 'current_run' then nullif(v_run.trigger_snapshot->>'last_organizer_template_id', '')::uuid
            else v_link_template_id_raw::uuid
          end;
          v_base_url := 'https://' || coalesce(nullif(v_branding.custom_domain, ''), 'verexahq.com');
          select v_base_url || '/o/' || public_token::text into v_organizer_link
          from public.organizer_templates where id = v_resolved_organizer_template_id;
          v_context := v_context || jsonb_build_object('organizer_link', v_organizer_link);
        end if;
        insert into public.notification_queue (workspace_id, recipient_email, channel, template_key, payload, entity_type, entity_id, event_type, dedupe_key)
        values (
          v_run.workspace_id, v_eng.primary_email, 'Email', v_step.action_config->>'template_slug', v_context,
          case when v_run.engagement_id is not null then 'engagement' else 'client' end,
          coalesce(v_run.engagement_id, v_run.client_id),
          'automation', 'automation_step:' || p_step_id || ':' || p_run_id
        )
        on conflict (workspace_id, template_key, dedupe_key) where dedupe_key is not null do nothing;
      end if;
    elsif v_step.action_type = 'send_sms' then
      if v_eng.primary_phone is null then
        raise exception 'Client has no phone on file';
      end if;
      if v_run.is_test then
        v_skip_note := 'test mode -- would text ' || v_eng.primary_phone;
      elsif v_eng.sms_opt_out then
        v_skip_note := 'client has opted out of sms';
      else
        v_link_template_id_raw := nullif(v_step.action_config->>'organizer_template_id', '');
        if v_link_template_id_raw is not null then
          v_resolved_organizer_template_id := case
            when v_link_template_id_raw = 'current_run' then nullif(v_run.trigger_snapshot->>'last_organizer_template_id', '')::uuid
            else v_link_template_id_raw::uuid
          end;
          v_base_url := 'https://' || coalesce(nullif(v_branding.custom_domain, ''), 'verexahq.com');
          select v_base_url || '/o/' || public_token::text into v_organizer_link
          from public.organizer_templates where id = v_resolved_organizer_template_id;
          v_context := v_context || jsonb_build_object('organizer_link', v_organizer_link);
        end if;
        insert into public.notification_queue (workspace_id, recipient_phone, channel, template_key, payload, entity_type, entity_id, event_type, dedupe_key)
        values (
          v_run.workspace_id, v_eng.primary_phone, 'SMS', v_step.action_config->>'template_slug', v_context,
          case when v_run.engagement_id is not null then 'engagement' else 'client' end,
          coalesce(v_run.engagement_id, v_run.client_id),
          'automation', 'automation_step:' || p_step_id || ':' || p_run_id
        )
        on conflict (workspace_id, template_key, dedupe_key) where dedupe_key is not null do nothing;
      end if;
    elsif v_step.action_type = 'create_task' then
      if v_run.engagement_id is null and v_run.client_id is null then
        raise exception 'This workflow run has no engagement or client to attach a task to';
      end if;
      insert into public.tasks (workspace_id, engagement_id, client_id, title, description, assigned_staff_id, due_date, priority, visibility)
      values (
        v_run.workspace_id, v_run.engagement_id, case when v_run.engagement_id is null then v_run.client_id else null end,
        public.render_merge_fields(coalesce(v_step.action_config->>'title', 'Automated task'), v_context),
        public.render_merge_fields(v_step.action_config->>'description', v_context),
        case when v_step.action_config->>'assigned_staff_id' = 'client_relationship_manager' then v_eng.relationship_manager_id
             else nullif(v_step.action_config->>'assigned_staff_id', '')::uuid end,
        case when v_step.action_config ? 'due_in_days' then now() + make_interval(days => (v_step.action_config->>'due_in_days')::int) else null end,
        coalesce(v_step.action_config->>'priority', 'medium'),
        coalesce(nullif(v_step.action_config->>'visibility', ''), 'internal')
      );
    elsif v_step.action_type = 'create_appointment' then
      if v_run.engagement_id is null and v_run.client_id is null then
        raise exception 'This workflow run has no engagement or client to schedule an appointment for';
      end if;

      v_appointment_start := (
        (current_date + coalesce((v_step.action_config->>'days_from_now')::int, 1))
        + coalesce(nullif(v_step.action_config->>'time_of_day', '')::time, '10:00'::time)
      ) at time zone coalesce(nullif(v_workspace.timezone, ''), 'America/New_York');
      v_appointment_end := v_appointment_start + make_interval(mins => coalesce((v_step.action_config->>'duration_minutes')::int, 30));

      insert into public.appointments (workspace_id, client_id, engagement_id, staff_id, title, description, location, start_at, end_at, status)
      values (
        v_run.workspace_id, v_run.client_id, v_run.engagement_id,
        nullif(v_step.action_config->>'staff_id', '')::uuid,
        public.render_merge_fields(coalesce(v_step.action_config->>'title', 'Appointment'), v_context),
        nullif(public.render_merge_fields(v_step.action_config->>'description', v_context), ''),
        nullif(v_step.action_config->>'location', ''),
        v_appointment_start, v_appointment_end, 'scheduled'
      );
    elsif v_step.action_type = 'add_dnd' then
      if v_run.client_id is null then
        raise exception 'This workflow run has no client to opt out';
      end if;
      v_dnd_channel := coalesce(nullif(v_step.action_config->>'channel', ''), 'both');
      update public.clients
      set sms_opt_out = case when v_dnd_channel in ('sms', 'both') then true else sms_opt_out end,
          sms_opt_out_at = case when v_dnd_channel in ('sms', 'both') then now() else sms_opt_out_at end,
          email_opt_out = case when v_dnd_channel in ('email', 'both') then true else email_opt_out end,
          email_opt_out_at = case when v_dnd_channel in ('email', 'both') then now() else email_opt_out_at end
      where id = v_run.client_id;
    elsif v_step.action_type = 'remove_dnd' then
      if v_run.client_id is null then
        raise exception 'This workflow run has no client to opt back in';
      end if;
      v_dnd_channel := coalesce(nullif(v_step.action_config->>'channel', ''), 'both');
      update public.clients
      set sms_opt_out = case when v_dnd_channel in ('sms', 'both') then false else sms_opt_out end,
          sms_opt_out_at = case when v_dnd_channel in ('sms', 'both') then null else sms_opt_out_at end,
          email_opt_out = case when v_dnd_channel in ('email', 'both') then false else email_opt_out end,
          email_opt_out_at = case when v_dnd_channel in ('email', 'both') then null else email_opt_out_at end
      where id = v_run.client_id;
    elsif v_step.action_type = 'send_organizer_template' then
      if v_run.client_id is null then
        raise exception 'This workflow run has no client to send an organizer to';
      end if;

      v_resolved_service_id := coalesce(
        nullif(v_run.trigger_snapshot->>'service_id', '')::uuid,
        (
          select service_id
          from public.client_service_interests
          where client_id = v_run.client_id
          order by created_at desc
          limit 1
        )
      );

      v_resolved_organizer_template_id := coalesce(
        nullif(v_step.action_config->>'organizer_template_id', '')::uuid,
        (
          select ot.id
          from public.services s
          join public.organizer_templates svc_ot on svc_ot.id = s.organizer_template_id
          join public.organizer_templates ot
            on ot.slug = svc_ot.slug
            and ot.workspace_id = v_run.workspace_id
          where s.id = v_resolved_service_id
          limit 1
        )
      );

      if v_resolved_organizer_template_id is null then
        raise exception 'Could not determine which organizer to send -- no service on file for this client and no organizer template configured on this step';
      end if;

      if v_run.is_test then
        v_skip_note := 'test mode -- would send an organizer request to the client';
      else
        insert into public.organizer_responses (workspace_id, client_id, engagement_id, organizer_template_id)
        values (v_run.workspace_id, v_run.client_id, v_run.engagement_id, v_resolved_organizer_template_id);

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

      select id into v_service from public.services where id = v_response.resolved_service_id;

      insert into public.engagements (workspace_id, client_id, service_id)
      values (v_run.workspace_id, v_run.client_id, v_service.id)
      returning id into v_new_engagement_id;
    elsif v_step.action_type = 'send_engagement_letter' then
      if v_run.engagement_id is null then
        raise exception 'This workflow run has no engagement to send an engagement letter for';
      end if;
      if v_run.client_id is null then
        raise exception 'This workflow run has no client to send an engagement letter to';
      end if;

      v_resolved_organizer_template_id := coalesce(
        nullif(v_step.action_config->>'engagement_letter_template_id', '')::uuid,
        (select engagement_letter_template_id from public.services where id = v_eng.service_id)
      );

      if v_resolved_organizer_template_id is null then
        raise exception 'No engagement letter template configured for this step or its service';
      end if;

      if v_run.is_test then
        v_skip_note := 'test mode -- would send an engagement letter for signature';
      else
        insert into public.pending_engagement_letter_sends (workspace_id, engagement_id, client_id, engagement_letter_template_id, additional_signer_relationship_type)
        values (v_run.workspace_id, v_run.engagement_id, v_run.client_id, v_resolved_organizer_template_id, nullif(v_step.action_config->>'additional_signer_relationship_type', ''));
      end if;
    elsif v_step.action_type = 'change_stage' then
      if v_run.engagement_id is not null then
        v_pipeline_entity_type := 'engagement';
        v_pipeline_entity_id := v_run.engagement_id;
      elsif v_run.client_id is not null then
        v_pipeline_entity_type := 'client';
        v_pipeline_entity_id := v_run.client_id;
      else
        raise exception 'This workflow run has no engagement or client to advance';
      end if;

      select current_stage_id into v_pipeline_stage_id
      from public.pipeline_runs
      where entity_type = v_pipeline_entity_type and entity_id = v_pipeline_entity_id and status = 'Active'
      order by started_at desc limit 1;

      if v_pipeline_stage_id is null then
        raise exception 'This % has no active pipeline stage to advance', v_pipeline_entity_type;
      end if;

      update public.pipeline_stages set status = 'Completed', completed_at = now() where id = v_pipeline_stage_id;
    elsif v_step.action_type = 'send_document_request' then
      if v_run.engagement_id is null and v_run.client_id is null then
        raise exception 'This workflow run has no engagement or client to attach a document request to';
      end if;
      if nullif(v_step.action_config->>'document_request_template_id', '') is null then
        raise exception 'No document request template configured for this step';
      end if;

      v_doc_request_entity_type := case when v_run.engagement_id is not null then 'engagement' else 'client' end;
      v_doc_request_entity_id := coalesce(v_run.engagement_id, v_run.client_id);

      insert into public.document_requests (workspace_id, entity_type, entity_id, document_request_template_id, title, due_date)
      values (
        v_run.workspace_id, v_doc_request_entity_type, v_doc_request_entity_id,
        (v_step.action_config->>'document_request_template_id')::uuid,
        coalesce(public.render_merge_fields(v_step.action_config->>'title', v_context), 'Requested documents'),
        case when v_step.action_config ? 'due_in_days' then (now() + make_interval(days => (v_step.action_config->>'due_in_days')::int))::date else null end
      )
      returning id into v_doc_request_id;

      insert into public.document_request_item_statuses (document_request_id, document_request_item_id, name, is_required, category, status, fulfilled_by_attachment_id)
      select
        v_doc_request_id, dri.id, dri.name, dri.is_required, dri.category,
        coalesce(prior.status, 'pending'), prior.fulfilled_by_attachment_id
      from public.document_request_items dri
      left join lateral (
        select s.status, s.fulfilled_by_attachment_id
        from public.document_request_item_statuses s
        join public.document_requests r on r.id = s.document_request_id
        where r.entity_type = v_doc_request_entity_type and r.entity_id = v_doc_request_entity_id
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
      v_rendered_message := public.render_merge_fields(v_step.action_config->>'message', v_context);

      v_resolved_staff_id := coalesce(
        nullif(v_step.action_config->>'staff_id', '')::uuid,
        (select user_id from public.workspace_users where workspace_id = v_run.workspace_id and is_owner = true and status = 'active' limit 1)
      );

      select wu.user_id, u.email into v_recipient
      from public.workspace_users wu
      join auth.users u on u.id = wu.user_id
      where wu.workspace_id = v_run.workspace_id and wu.user_id = v_resolved_staff_id and wu.status = 'active';

      if v_recipient.user_id is not null then
        if 'In-App' = any(v_channels) then
          perform public.create_notification(
            v_run.workspace_id,
            v_recipient.user_id,
            'automation',
            coalesce(nullif(v_step.action_config->>'template_key', ''), 'automation-step'),
            v_context || jsonb_build_object('message', v_rendered_message),
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
            v_context || jsonb_build_object('message', v_rendered_message),
            coalesce(nullif(v_step.action_config->>'priority', ''), 'Medium'),
            case when v_run.engagement_id is not null then 'engagement' else 'client' end,
            coalesce(v_run.engagement_id, v_run.client_id)
          );
        end if;
      end if;

    elsif v_step.action_type = 'move_pipeline_stage' then
      if v_run.client_id is null and v_run.engagement_id is null then
        raise exception 'This workflow run has no client or engagement to move';
      end if;
      if nullif(v_step.action_config->>'process_id', '') is null or nullif(v_step.action_config->>'process_stage_id', '') is null then
        raise exception 'No target pipeline stage configured for this step';
      end if;

      v_pipeline_entity_type := case when v_run.engagement_id is not null then 'engagement' else 'client' end;
      v_pipeline_entity_id := coalesce(v_run.engagement_id, v_run.client_id);

      select id, current_stage_id into v_pipeline_run_id, v_pipeline_stage_id
      from public.pipeline_runs
      where entity_type = v_pipeline_entity_type and entity_id = v_pipeline_entity_id and status = 'Active'
        and process_id = (v_step.action_config->>'process_id')::uuid
      order by started_at desc limit 1;

      if v_pipeline_run_id is null then
        v_pipeline_run_id := public.start_pipeline_run(v_pipeline_entity_type, v_pipeline_entity_id, (v_step.action_config->>'process_id')::uuid);
        select current_stage_id into v_pipeline_stage_id from public.pipeline_runs where id = v_pipeline_run_id;
        if v_pipeline_entity_type = 'engagement' then
          update public.engagements set workflow_id = (v_step.action_config->>'process_id')::uuid where id = v_pipeline_entity_id;
        end if;
      end if;

      select id into v_target_stage_id from public.pipeline_stages
      where pipeline_run_id = v_pipeline_run_id and process_stage_id = (v_step.action_config->>'process_stage_id')::uuid;

      if v_target_stage_id is null then
        raise exception 'Target stage is not part of this pipeline';
      end if;

      select display_order into v_target_order from public.pipeline_stages where id = v_target_stage_id;
      select display_order into v_current_order from public.pipeline_stages where id = v_pipeline_stage_id;

      if v_target_order < v_current_order then
        raise exception 'Moving backward through pipeline stages is not supported by this action';
      end if;

      if v_pipeline_stage_id is distinct from v_target_stage_id then
        for v_close_stage_id in
          select id from public.pipeline_stages
          where pipeline_run_id = v_pipeline_run_id
            and display_order > v_current_order and display_order < v_target_order
            and status not in ('Completed', 'Skipped')
          order by display_order desc
        loop
          update public.pipeline_stages set status = 'Skipped', completed_at = now() where id = v_close_stage_id;
        end loop;

        update public.pipeline_stages set status = 'Completed', completed_at = now() where id = v_pipeline_stage_id;
      end if;

      if v_pipeline_entity_type = 'client' and not exists (
        select 1 from public.processes where id = (v_step.action_config->>'process_id')::uuid and is_lead_funnel
      ) then
        for v_close_stage_id in
          select ps.id
          from public.pipeline_stages ps
          join public.pipeline_runs pr on pr.id = ps.pipeline_run_id
          join public.processes proc on proc.id = pr.process_id
          where pr.entity_type = 'client' and pr.entity_id = v_pipeline_entity_id and pr.status = 'Active'
            and pr.id <> v_pipeline_run_id and proc.is_lead_funnel
            and ps.status not in ('Completed', 'Skipped')
          order by ps.display_order desc
        loop
          update public.pipeline_stages set status = 'Skipped', completed_at = now() where id = v_close_stage_id;
        end loop;
      end if;

    elsif v_step.action_type = 'move_lead_to_service_pipeline' then
      if v_run.client_id is null then
        raise exception 'This workflow run has no client to move';
      end if;

      v_resolved_service_id := coalesce(
        nullif(v_run.trigger_snapshot->>'service_id', '')::uuid,
        (
          select service_id
          from public.client_service_interests
          where client_id = v_run.client_id
          order by created_at desc
          limit 1
        )
      );

      if v_resolved_service_id is null then
        raise exception 'This client has no service on file to resolve a pipeline from';
      end if;

      select process_id into v_target_process_id from public.services where id = v_resolved_service_id;
      if v_target_process_id is null then
        raise exception 'The client''s selected service has no pipeline configured';
      end if;

      select id into v_pipeline_run_id
      from public.pipeline_runs
      where entity_type = 'client' and entity_id = v_run.client_id and status = 'Active' and process_id = v_target_process_id
      order by started_at desc limit 1;

      if v_pipeline_run_id is null then
        perform public.start_pipeline_run('client', v_run.client_id, v_target_process_id);
      end if;

      if not exists (select 1 from public.processes where id = v_target_process_id and is_lead_funnel) then
        for v_close_stage_id in
          select ps.id
          from public.pipeline_stages ps
          join public.pipeline_runs pr on pr.id = ps.pipeline_run_id
          join public.processes proc on proc.id = pr.process_id
          where pr.entity_type = 'client' and pr.entity_id = v_run.client_id and pr.status = 'Active'
            and pr.process_id <> v_target_process_id and proc.is_lead_funnel
            and ps.status not in ('Completed', 'Skipped')
          order by ps.display_order desc
        loop
          update public.pipeline_stages set status = 'Skipped', completed_at = now() where id = v_close_stage_id;
        end loop;
      end if;

    elsif v_step.action_type = 'mark_lead_lost' then
      if v_run.client_id is null then
        raise exception 'This workflow run has no client to mark lost';
      end if;
      update public.clients set lifecycle_status = 'lost', lost_reason = v_step.action_config->>'reason', lost_at = now() where id = v_run.client_id;

    elsif v_step.action_type = 'convert_lead_to_client' then
      if v_run.client_id is null then
        raise exception 'This workflow run has no client to convert';
      end if;
      update public.clients set lifecycle_status = 'active' where id = v_run.client_id;

    elsif v_step.action_type = 'update_client' then
      if v_run.client_id is null then
        raise exception 'This workflow run has no client to update';
      end if;
      case v_step.action_config->>'field'
        when 'first_name' then
          update public.clients set first_name = v_step.action_config->>'value' where id = v_run.client_id;
        when 'middle_name' then
          update public.clients set middle_name = nullif(v_step.action_config->>'value', '') where id = v_run.client_id;
        when 'last_name' then
          update public.clients set last_name = v_step.action_config->>'value' where id = v_run.client_id;
        when 'suffix' then
          update public.clients set suffix = nullif(v_step.action_config->>'value', '') where id = v_run.client_id;
        when 'business_name' then
          update public.clients set business_name = nullif(v_step.action_config->>'value', '') where id = v_run.client_id;
        when 'client_type' then
          update public.clients set client_type = v_step.action_config->>'value' where id = v_run.client_id;
        when 'primary_email' then
          update public.clients
          set primary_email = v_step.action_config->>'value',
              normalized_email = nullif(lower(btrim(coalesce(v_step.action_config->>'value', ''))), '')
          where id = v_run.client_id;
        when 'primary_phone' then
          update public.clients
          set primary_phone = v_step.action_config->>'value',
              normalized_phone = nullif(regexp_replace(coalesce(v_step.action_config->>'value', ''), '\D', '', 'g'), '')
          where id = v_run.client_id;
        when 'address_line1' then
          update public.clients set address_line1 = nullif(v_step.action_config->>'value', '') where id = v_run.client_id;
        when 'address_line2' then
          update public.clients set address_line2 = nullif(v_step.action_config->>'value', '') where id = v_run.client_id;
        when 'city' then
          update public.clients set city = nullif(v_step.action_config->>'value', '') where id = v_run.client_id;
        when 'state' then
          update public.clients set state = nullif(v_step.action_config->>'value', '') where id = v_run.client_id;
        when 'postal_code' then
          update public.clients set postal_code = nullif(v_step.action_config->>'value', '') where id = v_run.client_id;
        when 'country' then
          update public.clients set country = nullif(v_step.action_config->>'value', '') where id = v_run.client_id;
        when 'relationship_manager_id' then
          update public.clients set relationship_manager_id = nullif(v_step.action_config->>'value', '')::uuid where id = v_run.client_id;
        else
          raise exception 'Unsupported field for update_client: %', v_step.action_config->>'field';
      end case;

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

    elsif v_step.action_type = 'create_quote' then
      if v_run.client_id is null then
        raise exception 'This workflow run has no client to quote';
      end if;
      insert into public.quotes (workspace_id, client_id, engagement_id, service_id, title, subtotal, tax_amount, discount_amount, total_amount, valid_until, notes)
      values (
        v_run.workspace_id, v_run.client_id, v_run.engagement_id,
        nullif(v_step.action_config->>'service_id', '')::uuid,
        coalesce(public.render_merge_fields(v_step.action_config->>'title', v_context), 'Quote'),
        coalesce((v_step.action_config->>'subtotal')::numeric, 0),
        coalesce((v_step.action_config->>'tax_amount')::numeric, 0),
        coalesce((v_step.action_config->>'discount_amount')::numeric, 0),
        coalesce((v_step.action_config->>'total_amount')::numeric, coalesce((v_step.action_config->>'subtotal')::numeric, 0)),
        nullif(v_step.action_config->>'valid_until', '')::date,
        public.render_merge_fields(v_step.action_config->>'notes', v_context)
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

      if v_run.is_test then
        v_skip_note := 'test mode -- would send this quote to the client';
      else
        update public.quotes set status = 'sent' where id = v_quote_id;
      end if;

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
      if nullif(v_step.action_config->>'tag', '') is null then
        raise exception 'No tag configured for this step';
      end if;
      update public.clients
      set tags = array_remove(coalesce(tags, '{}'), v_step.action_config->>'tag')
      where id = v_run.client_id;

    elsif v_step.action_type = 'add_note' then
      if v_run.engagement_id is null and v_run.client_id is null then
        raise exception 'This workflow run has no entity to attach a note to';
      end if;
      if nullif(v_step.action_config->>'body', '') is null then
        raise exception 'No note text configured for this step';
      end if;
      insert into public.notes (workspace_id, entity_type, entity_id, body, is_internal)
      values (
        v_run.workspace_id,
        case when v_run.engagement_id is not null then 'engagement' else 'client' end,
        coalesce(v_run.engagement_id, v_run.client_id),
        public.render_merge_fields(v_step.action_config->>'body', v_context),
        true
      );

    elsif v_step.action_type = 'send_portal_message' then
      if v_run.client_id is null then
        raise exception 'This workflow run has no client to message';
      end if;
      if nullif(v_step.action_config->>'body', '') is null then
        raise exception 'No message body configured for this step';
      end if;

      if v_run.is_test then
        v_skip_note := 'test mode -- would send a portal message to the client';
      else
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
        values (v_run.workspace_id, v_thread_id, 'staff', false, public.render_merge_fields(v_step.action_config->>'body', v_context));

        update public.message_threads set last_message_at = now() where id = v_thread_id;
      end if;

    elsif v_step.action_type = 'invite_to_portal' then
      if v_run.client_id is null then
        raise exception 'This workflow run has no client to invite';
      end if;

      if v_run.is_test then
        v_skip_note := 'test mode -- would invite the client to the portal';
      elsif not exists (select 1 from public.client_portal_users where client_id = v_run.client_id) then
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

      insert into public.automation_runs (workspace_id, automation_id, engagement_id, client_id, trigger_snapshot, status, is_test)
      values (v_run.workspace_id, (v_step.action_config->>'automation_id')::uuid, v_run.engagement_id, v_run.client_id, v_run.trigger_snapshot, 'running', v_run.is_test)
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

  insert into public.automation_execution_logs (workspace_id, automation_id, engagement_id, workflow_run_id, status, execution_data, error_message, executed_at)
  values (
    v_run.workspace_id, v_run.automation_id, v_run.engagement_id, p_run_id, v_status,
    jsonb_build_object('step_id', p_step_id, 'action_type', v_step.action_type, 'run_id', p_run_id)
      || case when v_skip_note is not null then jsonb_build_object('skipped_reason', v_skip_note) else '{}'::jsonb end,
    v_error, now()
  );

  if v_status = 'failed' then
    update public.automation_runs set status = 'failed', completed_at = now() where id = p_run_id;
  else
    perform public.start_next_automation_step(p_run_id);
  end if;
end;
$function$;

-- ---------------------------------------------------------------------
-- Fix 2: run_automation_test now builds trigger_snapshot from whichever
-- real data already exists for the picked client/engagement, in the same
-- shape the automation's actual trigger_type would have produced (see
-- fire_service_interest_automations, fire_organizer_submitted_automations,
-- fire_document_request_completed_automations) -- instead of always
-- passing an empty {"test_mode": true}. This is what makes condition
-- steps and trigger-context-dependent actions (e.g. create_engagement's
-- response_id requirement) actually exercisable by a test run.
-- ---------------------------------------------------------------------
create or replace function public.run_automation_test(p_automation_id uuid, p_client_id uuid, p_engagement_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_automation record;
  v_client record;
  v_issues record;
  v_context jsonb;
  v_run_id uuid;
  v_interest record;
  v_response record;
  v_doc_request record;
  v_service_id uuid;
begin
  select * into v_automation from public.automations where id = p_automation_id;
  if v_automation.id is null then
    raise exception 'Automation not found';
  end if;
  if not public.has_permission(v_automation.workspace_id, 'automations.manage') then
    raise exception 'You do not have permission to test workflows';
  end if;

  select id, workspace_id into v_client from public.clients where id = p_client_id;
  if v_client.id is null or v_client.workspace_id <> v_automation.workspace_id then
    raise exception 'Client not found in this workspace';
  end if;

  if p_engagement_id is not null and not exists (
    select 1 from public.engagements where id = p_engagement_id and client_id = p_client_id
  ) then
    raise exception 'Engagement does not belong to this client';
  end if;

  for v_issues in select * from public.validate_automation(p_automation_id) loop
    raise exception 'Fix this workflow before testing it -- %: %', v_issues.display_name, v_issues.issue;
  end loop;

  if v_automation.trigger_type = 'client.service_interest_selected' then
    select service_id, service_category_id, source into v_interest
    from public.client_service_interests
    where client_id = p_client_id
    order by created_at desc limit 1;
    v_context := jsonb_build_object('service_id', v_interest.service_id, 'service_category_id', v_interest.service_category_id, 'source', v_interest.source);
  elsif v_automation.trigger_type = 'organizer.submitted' then
    select id, organizer_template_id, status into v_response
    from public.organizer_responses
    where client_id = p_client_id and (p_engagement_id is null or engagement_id = p_engagement_id)
    order by created_at desc limit 1;
    v_context := jsonb_build_object('response_id', v_response.id, 'organizer_template_id', v_response.organizer_template_id, 'status', v_response.status);
  elsif v_automation.trigger_type = 'document_request.completed' then
    v_service_id := coalesce(
      (select service_id from public.engagements where id = p_engagement_id),
      (select service_id from public.client_service_interests where client_id = p_client_id order by created_at desc limit 1)
    );
    select id into v_doc_request
    from public.document_requests
    where (p_engagement_id is not null and entity_type = 'engagement' and entity_id = p_engagement_id)
       or (entity_type = 'client' and entity_id = p_client_id)
    order by created_at desc limit 1;
    v_context := jsonb_build_object('document_request_id', v_doc_request.id, 'service_id', v_service_id);
  else
    v_context := '{}'::jsonb;
  end if;

  v_context := v_context || jsonb_build_object('test_mode', true);

  insert into public.automation_runs (workspace_id, automation_id, client_id, engagement_id, trigger_snapshot, status, is_test)
  values (v_automation.workspace_id, p_automation_id, p_client_id, p_engagement_id, v_context, 'running', true)
  returning id into v_run_id;

  perform public.start_next_automation_step(v_run_id);

  return v_run_id;
end;
$$;

-- ---------------------------------------------------------------------
-- Fix 4: firm_connections.default_reviewer_id must actually belong to the
-- ERO (parent) workspace it's being set on. The UI's <select> already only
-- offers real members (see ConnectedPtinRow.tsx / settings/users/page.tsx),
-- but the column itself was writable via a plain table update with no
-- server-side check -- a direct write to any user id would have silently
-- saved, and a future engagement_share would have notified someone with
-- no access to the workspace instead of falling back to "every owner/admin"
-- as intended.
-- ---------------------------------------------------------------------
create or replace function public.enforce_default_reviewer_is_ero_member()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.default_reviewer_id is null then
    return new;
  end if;
  if TG_OP = 'UPDATE' and new.default_reviewer_id is not distinct from old.default_reviewer_id then
    return new;
  end if;

  if not exists (
    select 1 from public.workspace_users
    where workspace_id = new.parent_workspace_id and user_id = new.default_reviewer_id and status = 'active'
  ) then
    raise exception 'The chosen reviewer must be an active member of this workspace';
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_enforce_default_reviewer_is_ero_member on public.firm_connections;
create trigger trg_enforce_default_reviewer_is_ero_member
before insert or update of default_reviewer_id on public.firm_connections
for each row execute function public.enforce_default_reviewer_is_ero_member();
