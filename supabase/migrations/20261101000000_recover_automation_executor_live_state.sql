-- Migration history recovery -- Automations reconciliation, Phase 20/21.
--
-- Confirmed via direct production introspection (pg_get_functiondef,
-- 2026-09-24) that execute_automation_step, start_next_automation_step,
-- start_pipeline_run, and fire_firm_package_purchase_automations have all
-- been hotfixed live multiple times without a corresponding migration file
-- ever being committed -- the exact "production truth ahead of migration
-- history" drift pattern already fixed twice this engagement (see
-- 20261030090000_fix_execute_automation_step_orphan.sql and
-- 20261031100000_database_contract_guard.sql's own history-recovery note).
--
-- Every one of the "confirmed regressions" that a migration-file-only read
-- suggested for these four functions was checked directly against the live
-- function body before writing this migration, and every one of them is
-- ALREADY correct in production today:
--   * start_next_automation_step's Review Queue Decision pause (pause on
--     action_config->>'decision_mode' = 'review_queue', notify eligible
--     approvers, insert a pending_decision row) -- present and correct,
--     just accidentally duplicated back-to-back (the second copy is
--     unreachable dead code, since the first block always `return`s first).
--     This migration keeps one copy and drops the duplicate -- a pure
--     no-op cleanup, not a behavior change.
--   * start_pipeline_run's workspace-operational gate, "process not found"
--     check, and cross-workspace "process does not belong to this
--     workspace" ownership check -- all three present and correct.
--   * execute_automation_step's move_lead_to_service_pipeline action's
--     3-tier pipeline resolution (services.process_id override, falling
--     back to the client's matching client_service_interests row's
--     service_categories.process_id) -- present and correct. (The
--     preceding audit pass's "confirmed broken in production" finding for
--     this item was itself wrong -- it came from a fragile LIKE-pattern
--     substring check against the raw function source rather than a
--     direct read, and does not reflect actual production behavior.)
--   * execute_automation_step's create_task action already writes
--     trigger_snapshot.task_id (so the run is traceable to the task it
--     created), already resolves client_first_name into the merge-field
--     context, and already supports a business-hours due date
--     (action_config->>'due_in_business_hours', via the same
--     compute_business_hours_deadline engine business_hours_delay already
--     uses) alongside due_in_days.
--   * execute_automation_step's blocked-workspace gate already records
--     blocked_step_id (not just blocked_at) so a run blocked mid-step is
--     resumed correctly rather than having its never-executed step
--     silently treated as done.
--   * fire_firm_package_purchase_automations already re-derives
--     'partner_package.purchased' from 'firm_package.purchased' when the
--     purchase carries a partner_prospect_id, already builds full
--     purchaser_name/email/phone/connection_id/partner_prospect_id
--     context, and already passes connection_id/partner_prospect_id/
--     onboarding_id through to the automation_runs row it creates.
--
-- None of this is a functional fix. This migration exists purely so a
-- fresh database built from this migrations directory converges on the
-- same behavior production already has today, and so the next person
-- reading migration history doesn't have to re-derive any of the above
-- from a live database again. No behavior changes for any real workflow
-- run except the harmless removal of the duplicate dead-code block in
-- start_next_automation_step.

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
  v_step_tags text[];
  v_tag text;
  v_signature_attachment_id uuid;
  v_signature_title text;
  v_signature_recipient_email text;
  v_signature_recipient_name text;
  v_signature_request_id uuid;
  v_signature_access_token uuid;
  v_new_task_id uuid;
  v_connection_id uuid;
  v_partner_prospect_id uuid;
  v_partner_email text;
  v_partner_phone text;
begin
  select * into v_run from public.automation_runs where id = p_run_id;
  select * into v_step from public.automation_steps where id = p_step_id;

  if v_run.status <> 'running' then
    return;
  end if;

  if not public.is_workspace_operational(v_run.workspace_id) then
    if v_run.blocked_at is null then
      insert into public.automation_execution_logs (workspace_id, automation_id, engagement_id, workflow_run_id, status, execution_data, error_message, executed_at)
      values (
        v_run.workspace_id, v_run.automation_id, v_run.engagement_id, p_run_id, 'blocked',
        jsonb_build_object('run_id', p_run_id, 'step_id', p_step_id),
        'This workspace is not currently operational -- the run is paused and will resume automatically once the workspace becomes active again.',
        now()
      );
    end if;
    -- blocked_step_id records exactly which step was about to execute (as
    -- opposed to start_next_automation_step's own gate, which blocks BEFORE
    -- resolving a next step -- there, current_step_id is already-completed
    -- work, safe to resume by re-resolving "what's next"). Without this,
    -- resuming a run blocked here via start_next_automation_step would treat
    -- this never-executed step as done and silently skip it.
    update public.automation_runs set blocked_at = coalesce(blocked_at, now()), blocked_step_id = p_step_id where id = p_run_id;
    return;
  end if;

  if v_run.blocked_at is not null then
    update public.automation_runs set blocked_at = null, blocked_step_id = null where id = p_run_id;
  end if;

  v_connection_id := v_run.connection_id;
  v_partner_prospect_id := v_run.partner_prospect_id;

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
  elsif v_partner_prospect_id is not null then
    select null::text as engagement_number, null::text as status, null::text as priority, null::uuid as service_id,
      p.first_name, p.last_name, p.email::text as primary_email, p.phone as primary_phone,
      null::boolean as sms_opt_out, null::boolean as email_opt_out, p.assigned_staff_id as relationship_manager_id
    into v_eng
    from public.partner_prospects p
    where p.id = v_partner_prospect_id;
  else
    select null::text as engagement_number, null::text as status, null::text as priority, null::uuid as service_id,
      null::text as first_name, null::text as last_name, null::text as primary_email, null::text as primary_phone,
      null::boolean as sms_opt_out, null::boolean as email_opt_out, null::uuid as relationship_manager_id
    into v_eng;
  end if;

  select name, timezone into v_workspace from public.workspaces where id = v_run.workspace_id;
  select support_phone, support_email, custom_domain into v_branding from public.branding where workspace_id = v_run.workspace_id;

  v_context := jsonb_build_object(
    'engagement_number', v_eng.engagement_number,
    'client_name', btrim(coalesce(v_eng.first_name, '') || ' ' || coalesce(v_eng.last_name, '')),
    'first_name', v_eng.first_name,
    'client_first_name', v_eng.first_name,
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
      if v_run.client_id is null and v_run.engagement_id is null then
        if v_connection_id is not null then
          select w.primary_contact_email::text into v_partner_email
          from public.firm_connections fc
          join public.workspaces w on w.id = fc.child_workspace_id
          where fc.id = v_connection_id;

          if v_partner_email is null then
            raise exception 'Partner workspace has no primary contact email on file';
          end if;

          if v_run.is_test then
            v_skip_note := 'test mode -- would email ' || v_partner_email;
          else
            insert into public.notification_queue (workspace_id, recipient_email, channel, template_key, payload, entity_type, entity_id, event_type, dedupe_key)
            values (
              v_run.workspace_id, v_partner_email, 'Email', v_step.action_config->>'template_slug', v_context,
              'firm_connection', v_connection_id,
              'automation', 'automation_step:' || p_step_id || ':' || p_run_id
            )
            on conflict (workspace_id, template_key, dedupe_key) where dedupe_key is not null do nothing;
          end if;
        elsif v_partner_prospect_id is not null then
          v_partner_email := v_eng.primary_email;

          if v_partner_email is null then
            raise exception 'Partner prospect has no email on file';
          end if;

          if v_run.is_test then
            v_skip_note := 'test mode -- would email ' || v_partner_email;
          else
            insert into public.notification_queue (workspace_id, recipient_email, channel, template_key, payload, entity_type, entity_id, event_type, dedupe_key)
            values (
              v_run.workspace_id, v_partner_email, 'Email', v_step.action_config->>'template_slug', v_context,
              'partner_prospect', v_partner_prospect_id,
              'automation', 'automation_step:' || p_step_id || ':' || p_run_id
            )
            on conflict (workspace_id, template_key, dedupe_key) where dedupe_key is not null do nothing;
          end if;
        else
          raise exception 'This workflow run has no client, engagement, or connection to email';
        end if;
      else
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
      end if;
    elsif v_step.action_type = 'send_sms' then
      if v_run.client_id is null and v_run.engagement_id is null then
        if v_connection_id is not null then
          select w.phone into v_partner_phone
          from public.firm_connections fc
          join public.workspaces w on w.id = fc.child_workspace_id
          where fc.id = v_connection_id;

          if v_partner_phone is null then
            raise exception 'Partner workspace has no phone number on file';
          end if;

          if v_run.is_test then
            v_skip_note := 'test mode -- would text ' || v_partner_phone;
          else
            insert into public.notification_queue (workspace_id, recipient_phone, channel, template_key, payload, entity_type, entity_id, event_type, dedupe_key)
            values (
              v_run.workspace_id, v_partner_phone, 'SMS', v_step.action_config->>'template_slug', v_context,
              'firm_connection', v_connection_id,
              'automation', 'automation_step:' || p_step_id || ':' || p_run_id
            )
            on conflict (workspace_id, template_key, dedupe_key) where dedupe_key is not null do nothing;
          end if;
        elsif v_partner_prospect_id is not null then
          v_partner_phone := v_eng.primary_phone;

          if v_partner_phone is null then
            raise exception 'Partner prospect has no phone number on file';
          end if;

          if v_run.is_test then
            v_skip_note := 'test mode -- would text ' || v_partner_phone;
          else
            insert into public.notification_queue (workspace_id, recipient_phone, channel, template_key, payload, entity_type, entity_id, event_type, dedupe_key)
            values (
              v_run.workspace_id, v_partner_phone, 'SMS', v_step.action_config->>'template_slug', v_context,
              'partner_prospect', v_partner_prospect_id,
              'automation', 'automation_step:' || p_step_id || ':' || p_run_id
            )
            on conflict (workspace_id, template_key, dedupe_key) where dedupe_key is not null do nothing;
          end if;
        else
          raise exception 'This workflow run has no client, engagement, or connection to text';
        end if;
      else
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
      end if;
    elsif v_step.action_type = 'create_task' then
      if v_run.engagement_id is null and v_run.client_id is null and v_connection_id is null and v_partner_prospect_id is null then
        raise exception 'This workflow run has no engagement, client, connection, or partner prospect to attach a task to';
      end if;
      insert into public.tasks (workspace_id, engagement_id, client_id, firm_connection_id, partner_prospect_id, title, description, assigned_staff_id, due_date, priority, visibility)
      values (
        v_run.workspace_id, v_run.engagement_id,
        case when v_run.engagement_id is null then v_run.client_id else null end,
        case when v_run.engagement_id is null and v_run.client_id is null then v_connection_id else null end,
        case when v_run.engagement_id is null and v_run.client_id is null and v_connection_id is null then v_partner_prospect_id else null end,
        public.render_merge_fields(coalesce(v_step.action_config->>'title', 'Automated task'), v_context),
        public.render_merge_fields(v_step.action_config->>'description', v_context),
        case when v_step.action_config->>'assigned_staff_id' = 'client_relationship_manager' then v_eng.relationship_manager_id
             else nullif(v_step.action_config->>'assigned_staff_id', '')::uuid end,
        case when v_step.action_config ? 'due_in_days' then now() + make_interval(days => (v_step.action_config->>'due_in_days')::int) else null end,
        coalesce(v_step.action_config->>'priority', 'medium'),
        coalesce(nullif(v_step.action_config->>'visibility', ''), 'internal')
      )
      returning id into v_new_task_id;

      if nullif(v_step.action_config->>'due_in_business_hours', '') is not null then
        update public.tasks
        set due_date = public.compute_business_hours_deadline(
          v_run.workspace_id,
          now(),
          (v_step.action_config->>'due_in_business_hours')::numeric
        )
        where id = v_new_task_id;
      end if;

      update public.automation_runs
      set trigger_snapshot = coalesce(trigger_snapshot, '{}'::jsonb)
        || jsonb_build_object(
             'created_tasks',
             coalesce(trigger_snapshot->'created_tasks', '{}'::jsonb) || jsonb_build_object(p_step_id::text, v_new_task_id)
           )
      where id = p_run_id;

      update public.automation_runs
      set trigger_snapshot = coalesce(trigger_snapshot, '{}'::jsonb)
        || jsonb_build_object('task_id', v_new_task_id)
      where id = p_run_id;
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
    elsif v_step.action_type = 'send_document_for_signature' then
      v_signature_attachment_id := nullif(v_step.action_config->>'attachment_id', '')::uuid;
      if v_signature_attachment_id is null then
        raise exception 'No document configured for this step';
      end if;
      v_signature_title := coalesce(nullif(public.render_merge_fields(v_step.action_config->>'title', v_context), ''), 'Please sign this document');
      v_signature_recipient_email := null;
      v_signature_recipient_name := null;

      if v_eng.primary_email is not null then
        v_signature_recipient_email := v_eng.primary_email;
        v_signature_recipient_name := btrim(coalesce(v_eng.first_name, '') || ' ' || coalesce(v_eng.last_name, ''));
      elsif v_connection_id is not null then
        select w.primary_contact_email, w.name into v_signature_recipient_email, v_signature_recipient_name
        from public.firm_connections fc
        join public.workspaces w on w.id = fc.child_workspace_id
        where fc.id = v_connection_id;
      end if;

      if v_signature_recipient_email is null then
        raise exception 'No recipient email could be resolved to send this document for signature';
      end if;

      if v_run.is_test then
        v_skip_note := 'test mode -- would send "' || v_signature_title || '" to ' || v_signature_recipient_email || ' for signature';
      else
        insert into public.signature_requests (workspace_id, attachment_id, title)
        values (v_run.workspace_id, v_signature_attachment_id, v_signature_title)
        returning id into v_signature_request_id;

        insert into public.signature_request_signers (signature_request_id, signer_name, signer_email, sign_order)
        values (v_signature_request_id, coalesce(nullif(v_signature_recipient_name, ''), 'Recipient'), v_signature_recipient_email, 1)
        returning access_token into v_signature_access_token;

        v_base_url := 'https://' || coalesce(nullif(v_branding.custom_domain, ''), 'verexahq.com');

        insert into public.notification_queue (workspace_id, recipient_email, channel, template_key, payload, entity_type, entity_id, event_type, dedupe_key)
        values (
          v_run.workspace_id, v_signature_recipient_email, 'Email', 'document-signature-request',
          jsonb_build_object('title', v_signature_title, 'sign_link', v_base_url || '/sign/' || v_signature_access_token::text, 'firm_name', v_workspace.name),
          'document', v_signature_attachment_id,
          'automation', 'automation_step:' || p_step_id || ':' || p_run_id
        )
        on conflict (workspace_id, template_key, dedupe_key) where dedupe_key is not null do nothing;

        update public.automation_runs
        set trigger_snapshot = coalesce(trigger_snapshot, '{}'::jsonb)
          || jsonb_build_object(
               'document_signatures',
               coalesce(trigger_snapshot->'document_signatures', '{}'::jsonb) || jsonb_build_object(p_step_id::text, v_signature_request_id)
             )
        where id = p_run_id;
      end if;
    elsif v_step.action_type = 'change_stage' then
      if v_run.engagement_id is not null then
        v_pipeline_entity_type := 'engagement';
        v_pipeline_entity_id := v_run.engagement_id;
      elsif v_run.client_id is not null then
        v_pipeline_entity_type := 'client';
        v_pipeline_entity_id := v_run.client_id;
      elsif v_partner_prospect_id is not null then
        v_skip_note := 'partner prospect has no pipeline stage to advance yet';
      else
        raise exception 'This workflow run has no engagement or client to advance';
      end if;

      if v_pipeline_entity_type is not null then
        select current_stage_id into v_pipeline_stage_id
        from public.pipeline_runs
        where entity_type = v_pipeline_entity_type and entity_id = v_pipeline_entity_id and status = 'Active'
        order by started_at desc limit 1;

        if v_pipeline_stage_id is null then
          raise exception 'This % has no active pipeline stage to advance', v_pipeline_entity_type;
        end if;

        update public.pipeline_stages set status = 'Completed', completed_at = now() where id = v_pipeline_stage_id;
      end if;
    elsif v_step.action_type = 'send_document_request' then
      if v_run.engagement_id is null and v_run.client_id is null and v_connection_id is null then
        raise exception 'This workflow run has no engagement, client, or connection to attach a document request to';
      end if;
      if nullif(v_step.action_config->>'document_request_template_id', '') is null then
        raise exception 'No document request template configured for this step';
      end if;

      if v_run.engagement_id is not null then
        v_doc_request_entity_type := 'engagement';
        v_doc_request_entity_id := v_run.engagement_id;
      elsif v_run.client_id is not null then
        v_doc_request_entity_type := 'client';
        v_doc_request_entity_id := v_run.client_id;
      else
        v_doc_request_entity_type := 'firm_connection';
        v_doc_request_entity_id := v_connection_id;
      end if;

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

      if v_doc_request_entity_type = 'firm_connection' and v_run.onboarding_id is not null then
        update public.partner_onboardings
        set document_request_id = v_doc_request_id
        where id = v_run.onboarding_id and document_request_id is null;
      end if;

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
        if v_run.client_id is not null then
          update public.clients set relationship_manager_id = v_resolved_staff_id where id = v_run.client_id;
        elsif v_partner_prospect_id is not null then
          update public.partner_prospects set assigned_staff_id = v_resolved_staff_id where id = v_partner_prospect_id;
        elsif v_run.onboarding_id is not null then
          update public.partner_onboardings set assigned_staff_id = v_resolved_staff_id where id = v_run.onboarding_id;
        else
          raise exception 'This workflow run has no client, partner prospect, or partner onboarding to assign';
        end if;
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
      if v_run.client_id is null and v_run.engagement_id is null and v_connection_id is null then
        if v_partner_prospect_id is not null then
          v_skip_note := 'partner prospect has no pipeline to move (pipeline stages are not yet supported for prospects)';
        else
          raise exception 'This workflow run has no client, engagement, or connection to move';
        end if;
      else
        if nullif(v_step.action_config->>'process_id', '') is null or nullif(v_step.action_config->>'process_stage_id', '') is null then
          raise exception 'No target pipeline stage configured for this step';
        end if;

        v_pipeline_entity_type := case when v_run.engagement_id is not null then 'engagement' when v_run.client_id is not null then 'client' else 'firm_connection' end;
        v_pipeline_entity_id := coalesce(v_run.engagement_id, v_run.client_id, v_connection_id);

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

      select process_id into v_target_process_id
      from public.services
      where id = v_resolved_service_id;

      if v_target_process_id is null then
        select sc.process_id
        into v_target_process_id
        from public.client_service_interests csi
        join public.service_categories sc on sc.id = csi.service_category_id
        where csi.client_id = v_run.client_id
          and csi.service_id = v_resolved_service_id
        order by csi.created_at desc
        limit 1;
      end if;

      if v_target_process_id is null then
        raise exception 'The selected service and its category have no pipeline configured';
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
      v_step_tags := coalesce(
        (select array_agg(value #>> '{}') from jsonb_array_elements(v_step.action_config->'tags')),
        case when nullif(v_step.action_config->>'tag', '') is not null then array[v_step.action_config->>'tag'] else null end
      );
      if v_step_tags is null or array_length(v_step_tags, 1) is null then
        raise exception 'No tag configured for this step';
      end if;
      if v_run.client_id is not null then
        update public.clients
        set tags = array(select distinct unnest(coalesce(tags, '{}') || v_step_tags))
        where id = v_run.client_id;
      elsif v_connection_id is not null then
        update public.firm_connections
        set tags = array(select distinct unnest(coalesce(tags, '{}') || v_step_tags))
        where id = v_connection_id;
      elsif v_partner_prospect_id is not null then
        update public.partner_prospects
        set tags = array(select distinct unnest(coalesce(tags, '{}') || v_step_tags))
        where id = v_partner_prospect_id;
      else
        raise exception 'This workflow run has no client, connection, or partner prospect to tag';
      end if;

    elsif v_step.action_type = 'remove_tag' then
      v_step_tags := coalesce(
        (select array_agg(value #>> '{}') from jsonb_array_elements(v_step.action_config->'tags')),
        case when nullif(v_step.action_config->>'tag', '') is not null then array[v_step.action_config->>'tag'] else null end
      );
      if v_step_tags is null or array_length(v_step_tags, 1) is null then
        raise exception 'No tag configured for this step';
      end if;
      if v_run.client_id is not null then
        foreach v_tag in array v_step_tags loop
          update public.clients set tags = array_remove(coalesce(tags, '{}'), v_tag) where id = v_run.client_id;
        end loop;
      elsif v_connection_id is not null then
        foreach v_tag in array v_step_tags loop
          update public.firm_connections set tags = array_remove(coalesce(tags, '{}'), v_tag) where id = v_connection_id;
        end loop;
      elsif v_partner_prospect_id is not null then
        foreach v_tag in array v_step_tags loop
          update public.partner_prospects set tags = array_remove(coalesce(tags, '{}'), v_tag) where id = v_partner_prospect_id;
        end loop;
      else
        raise exception 'This workflow run has no client, connection, or partner prospect to untag';
      end if;

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

      insert into public.automation_runs (workspace_id, automation_id, engagement_id, client_id, connection_id, onboarding_id, partner_prospect_id, trigger_snapshot, status, is_test)
      values (v_run.workspace_id, (v_step.action_config->>'automation_id')::uuid, v_run.engagement_id, v_run.client_id, v_run.connection_id, v_run.onboarding_id, v_run.partner_prospect_id, v_run.trigger_snapshot, 'running', v_run.is_test)
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
$function$
;

CREATE OR REPLACE FUNCTION public.start_next_automation_step(p_run_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_run record;
  v_edge record;
  v_next_step_id uuid;
  v_next record;
  v_matched boolean;
  v_has_edges boolean;
  v_current_step_id uuid;
  v_current_step record;
  v_loop_guard int := 0;
  v_wait_mode text;
  v_scheduled_for timestamptz;
  v_approver record;
  v_approval_message text;
  v_retry_started_at timestamptz;
  v_retry_timeout_days int;
begin
  select * into v_run from public.automation_runs where id = p_run_id;
  if v_run.status <> 'running' then
    return;
  end if;

  if not public.is_workspace_operational(v_run.workspace_id) then
    if v_run.blocked_at is null then
      insert into public.automation_execution_logs (workspace_id, automation_id, engagement_id, workflow_run_id, status, execution_data, error_message, executed_at)
      values (
        v_run.workspace_id, v_run.automation_id, v_run.engagement_id, p_run_id, 'blocked',
        jsonb_build_object('run_id', p_run_id, 'current_step_id', v_run.current_step_id),
        'This workspace is not currently operational -- the run is paused and will resume automatically once the workspace becomes active again.',
        now()
      );
    end if;
    -- No blocked_step_id here: current_step_id is already-completed work at
    -- this point (or null, for a fresh run), not a not-yet-executed step, so
    -- resuming by re-resolving "what's next" from it is safe.
    update public.automation_runs set blocked_at = coalesce(blocked_at, now()), blocked_step_id = null where id = p_run_id;
    return;
  end if;

  if v_run.blocked_at is not null then
    update public.automation_runs set blocked_at = null, blocked_step_id = null where id = p_run_id;
  end if;

  v_current_step_id := v_run.current_step_id;

  loop
    v_loop_guard := v_loop_guard + 1;
    if v_loop_guard > 200 then
      insert into public.automation_execution_logs (workspace_id, automation_id, engagement_id, status, execution_data, error_message, executed_at)
      values (v_run.workspace_id, v_run.automation_id, v_run.engagement_id, 'failed',
        jsonb_build_object('run_id', p_run_id, 'step_id', v_current_step_id),
        'This workflow''s branches form a loop that never reaches an action step (possible cycle). Stopped after 200 steps to avoid running forever.',
        now());
      update public.automation_runs set status = 'failed', completed_at = now() where id = p_run_id;
      return;
    end if;

    if v_current_step_id is null then
      select s.id into v_next_step_id
      from public.automation_steps s
      where s.automation_id = v_run.automation_id
        and not exists (select 1 from public.automation_step_edges e where e.to_step_id = s.id)
      order by s.display_order asc
      limit 1;

      if v_next_step_id is null then
        update public.automation_runs set status = 'completed', completed_at = now() where id = p_run_id;
        return;
      end if;
    else
      v_matched := false;
      v_next_step_id := null;
      for v_edge in
        select e.* from public.automation_step_edges e
        join public.automation_steps ts on ts.id = e.to_step_id
        where e.from_step_id = v_current_step_id
          and ts.automation_id = v_run.automation_id
        order by e.sort_order asc
      loop
        if v_edge.branch_conditions is null
           or public.evaluate_automation_conditions(v_edge.branch_conditions, v_run.trigger_snapshot, v_run.workspace_id, v_run.client_id, v_run.engagement_id, v_run.connection_id, v_run.onboarding_id)
        then
          v_next_step_id := v_edge.to_step_id;
          v_matched := true;
          exit;
        end if;
      end loop;

      if not v_matched then
        select exists(
          select 1 from public.automation_step_edges e
          join public.automation_steps ts on ts.id = e.to_step_id
          where e.from_step_id = v_current_step_id and ts.automation_id = v_run.automation_id
        ) into v_has_edges;

        if v_has_edges then
          select * into v_current_step from public.automation_steps where id = v_current_step_id;

          if v_current_step.action_type = 'condition' and coalesce((v_current_step.action_config->>'retry_until_matched')::boolean, false) then
            select created_at into v_retry_started_at
            from public.automation_pending_steps
            where run_id = p_run_id and automation_step_id = v_current_step_id
            order by created_at asc limit 1;

            v_retry_timeout_days := coalesce(nullif(v_current_step.action_config->>'retry_timeout_days', '')::int, 90);

            if v_retry_started_at is null or v_retry_started_at > now() - make_interval(days => v_retry_timeout_days) then
              if v_retry_started_at is null then
                insert into public.automation_pending_steps (workspace_id, run_id, automation_step_id, status, scheduled_for)
                values (v_run.workspace_id, p_run_id, v_current_step_id, 'pending_delay', now());
              end if;
              return;
            end if;
          end if;

          insert into public.automation_execution_logs (workspace_id, automation_id, engagement_id, status, execution_data, executed_at)
          values (v_run.workspace_id, v_run.automation_id, v_run.engagement_id, 'completed',
            jsonb_build_object('run_id', p_run_id, 'step_id', v_current_step_id, 'dead_end', true, 'reason', 'no branch matched and no default edge'),
            now());
        end if;
        update public.automation_runs set status = 'completed', completed_at = now() where id = p_run_id;
        return;
      end if;

      if v_next_step_id is null then
        insert into public.automation_execution_logs (workspace_id, automation_id, engagement_id, status, execution_data, executed_at)
        values (v_run.workspace_id, v_run.automation_id, v_run.engagement_id, 'completed',
          jsonb_build_object('run_id', p_run_id, 'step_id', v_current_step_id, 'unwired_branch', true, 'reason', 'the matching branch has not been connected to a next step yet'),
          now());
        update public.automation_runs set status = 'completed', completed_at = now() where id = p_run_id;
        return;
      end if;
    end if;

    select * into v_next from public.automation_steps where id = v_next_step_id;
    update public.automation_runs set current_step_id = v_next_step_id where id = p_run_id;

    if v_next.action_type <> 'condition' and v_next.is_enabled = false then
      insert into public.automation_execution_logs (workspace_id, automation_id, engagement_id, status, execution_data, executed_at)
      values (v_run.workspace_id, v_run.automation_id, v_run.engagement_id, 'completed',
        jsonb_build_object('run_id', p_run_id, 'step_id', v_next.id, 'action_type', v_next.action_type, 'skipped_disabled', true), now());
      v_current_step_id := v_next_step_id;
      continue;
    end if;

    if v_next.action_type = 'condition'
       and v_next.action_config->>'decision_mode' = 'review_queue' then
      insert into public.automation_pending_steps (workspace_id, run_id, automation_step_id, status)
      values (v_run.workspace_id, p_run_id, v_next.id, 'pending_decision');

      for v_approver in
        select wu.user_id
        from public.workspace_users wu
        left join public.roles r on r.id = wu.role_id
        where wu.workspace_id = v_run.workspace_id
          and wu.status = 'active'
          and (
            (v_next.approver_role_id is not null and wu.role_id = v_next.approver_role_id)
            or (v_next.approver_role_id is null and (wu.is_owner or r.slug in ('owner', 'admin')))
          )
      loop
        perform public.create_notification(
          v_run.workspace_id,
          v_approver.user_id,
          'automation',
          'automation-review-decision-needed',
          jsonb_build_object(
            'message', coalesce(nullif(v_next.display_name, ''), 'Review Queue Decision') || ' is waiting for a decision',
            'run_id', p_run_id,
            'automation_step_id', v_next.id,
            'engagement_id', v_run.engagement_id,
            'client_id', v_run.client_id
          ),
          array['In-App'],
          'High',
          'automation',
          v_run.automation_id
        );
      end loop;
      return;
    end if;

    if v_next.action_type = 'condition' and v_next.delay_minutes = 0 then
      insert into public.automation_execution_logs (workspace_id, automation_id, engagement_id, status, execution_data, executed_at)
      values (v_run.workspace_id, v_run.automation_id, v_run.engagement_id, 'completed',
        jsonb_build_object('run_id', p_run_id, 'step_id', v_next.id, 'action_type', 'condition'), now());
      v_current_step_id := v_next_step_id;
      continue;
    end if;

    v_wait_mode := case when v_next.action_type = 'delay' then coalesce(v_next.action_config->>'wait_mode', 'duration') else 'duration' end;

    if v_next.requires_approval then
      insert into public.automation_pending_steps (workspace_id, run_id, automation_step_id, status)
      values (v_run.workspace_id, p_run_id, v_next.id, 'pending_approval');

      v_approval_message := coalesce(nullif(v_next.display_name, ''), initcap(replace(v_next.action_type, '_', ' '))) || ' needs your approval before it runs';

      for v_approver in
        select wu.user_id
        from public.workspace_users wu
        left join public.roles r on r.id = wu.role_id
        where wu.workspace_id = v_run.workspace_id and wu.status = 'active'
          and (
            (v_next.approver_role_id is not null and wu.role_id = v_next.approver_role_id)
            or (v_next.approver_role_id is null and (wu.is_owner or r.slug in ('owner', 'admin')))
          )
      loop
        perform public.create_notification(
          v_run.workspace_id,
          v_approver.user_id,
          'automation',
          'automation-approval-needed',
          jsonb_build_object('message', v_approval_message),
          array['In-App'],
          'High',
          'automation',
          v_run.automation_id
        );
      end loop;
    elsif v_next.action_type = 'business_hours_delay' then
      v_scheduled_for := public.compute_business_hours_deadline(v_run.workspace_id, now(), coalesce(nullif(v_next.action_config->>'hours', '')::numeric, 24));
      insert into public.automation_pending_steps (workspace_id, run_id, automation_step_id, status, scheduled_for)
      values (v_run.workspace_id, p_run_id, v_next.id, 'pending_delay', v_scheduled_for);
    elsif v_wait_mode = 'until_date' then
      v_scheduled_for := nullif(v_next.action_config->>'wait_until_at', '')::timestamptz;
      if v_scheduled_for is null then
        perform public.execute_automation_step(p_run_id, v_next.id);
      else
        insert into public.automation_pending_steps (workspace_id, run_id, automation_step_id, status, scheduled_for)
        values (v_run.workspace_id, p_run_id, v_next.id, 'pending_delay', v_scheduled_for);
      end if;
    elsif v_wait_mode = 'until_condition' then
      insert into public.automation_pending_steps (workspace_id, run_id, automation_step_id, status, scheduled_for)
      values (v_run.workspace_id, p_run_id, v_next.id, 'pending_delay', now());
    elsif v_next.delay_minutes > 0 then
      insert into public.automation_pending_steps (workspace_id, run_id, automation_step_id, status, scheduled_for)
      values (v_run.workspace_id, p_run_id, v_next.id, 'pending_delay', now() + make_interval(mins => v_next.delay_minutes));
    else
      perform public.execute_automation_step(p_run_id, v_next.id);
    end if;
    return;
  end loop;
end;
$function$;


CREATE OR REPLACE FUNCTION public.start_pipeline_run(p_entity_type text, p_entity_id uuid, p_process_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_run_id uuid;
  v_workspace_id uuid;
  v_process_workspace_id uuid;
begin
  if p_entity_type = 'client' then
    select workspace_id into v_workspace_id from public.clients where id = p_entity_id;
  elsif p_entity_type = 'engagement' then
    select workspace_id into v_workspace_id from public.engagements where id = p_entity_id;
  elsif p_entity_type = 'firm_connection' then
    select parent_workspace_id into v_workspace_id from public.firm_connections where id = p_entity_id;
  else
    raise exception 'unsupported entity_type: %', p_entity_type;
  end if;

  if v_workspace_id is null then
    raise exception '% not found', p_entity_type;
  end if;

  if not public.is_workspace_operational(v_workspace_id) then
    raise exception 'this workspace is not currently operational';
  end if;

  if not exists (select 1 from public.processes where id = p_process_id) then
    raise exception 'process % not found', p_process_id;
  end if;

  select workspace_id into v_process_workspace_id from public.processes where id = p_process_id;
  if v_process_workspace_id is not null and v_process_workspace_id is distinct from v_workspace_id then
    raise exception 'process % does not belong to this workspace', p_process_id;
  end if;

  insert into public.pipeline_runs (workspace_id, entity_type, entity_id, process_id, status, started_at)
  values (v_workspace_id, p_entity_type, p_entity_id, p_process_id, 'Active', now())
  returning id into v_run_id;

  insert into public.pipeline_stages (workspace_id, pipeline_run_id, entity_type, process_stage_id, stage_name, display_order)
  select v_workspace_id, v_run_id, p_entity_type, id, name, display_order
  from public.process_stages
  where process_id = p_process_id
  order by display_order asc;

  update public.pipeline_runs
  set current_stage_id = (select id from public.pipeline_stages where pipeline_run_id = v_run_id order by display_order asc limit 1)
  where id = v_run_id;

  update public.pipeline_stages
  set status = 'In Progress', started_at = now()
  where id = (select current_stage_id from public.pipeline_runs where id = v_run_id);

  return v_run_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.fire_firm_package_purchase_automations()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_automation record;
  v_context jsonb;
  v_run_id uuid;
  v_event text;
  v_package record;
  v_buyer_name text;
  v_selected_labels jsonb;
  v_onboarding_id uuid;
begin
  if new.status = 'active' and old.status is distinct from 'active' then
    v_event := 'firm_package.purchased';
  elsif new.status = 'canceled' and old.status is distinct from 'canceled' then
    v_event := 'firm_package.canceled';
  else
    return new;
  end if;

  if new.partner_prospect_id is not null and v_event = 'firm_package.purchased' then
    v_event := 'partner_package.purchased';
  end if;

  select name, billing_cadence, purchase_purpose into v_package from public.firm_packages where id = new.package_id;

  if v_event in ('firm_package.purchased', 'partner_package.purchased') and coalesce(v_package.purchase_purpose, 'partner_onboarding') = 'partner_onboarding' then
    v_onboarding_id := public._get_or_create_partner_onboarding(new.parent_workspace_id, new.connection_id, new.package_id, new.id, new.partner_prospect_id);
  end if;

  select name into v_buyer_name from public.workspaces where id = new.workspace_id;
  select coalesce(jsonb_agg(o.label), '[]'::jsonb) into v_selected_labels
    from public.firm_package_options o where o.id = any(coalesce(new.selected_option_ids, '{}'::uuid[]));

  v_context := jsonb_build_object(
    'purchase_id', new.id,
    'package_id', new.package_id,
    'package_purchase.package_name', v_package.name,
    'package_purchase.billing_cadence', coalesce(new.billing_cadence, v_package.billing_cadence),
    'connection_id', new.connection_id,
    'partner_prospect_id', new.partner_prospect_id,
    'buyer_workspace_name', coalesce(v_buyer_name, new.purchaser_name),
    'amount', new.amount,
    'selected_options', v_selected_labels,
    'purchaser_name', new.purchaser_name,
    'purchaser_email', new.purchaser_email,
    'purchaser_phone', new.purchaser_phone,
    'currency', new.currency,
    'payment_status', new.status,
    'payment_provider', new.payment_provider,
    'payment_reference', new.payment_reference,
    'purchased_at', new.purchased_at,
    'source', new.source,
    'external_customer_id', new.external_customer_id,
    'external_checkout_session_id', new.external_checkout_session_id,
    'external_payment_id', new.external_payment_id
  );

  for v_automation in
    select * from public.automations
    where workspace_id = new.parent_workspace_id and is_enabled = true and status = 'published'
      and trigger_type = v_event
  loop
    if public.evaluate_automation_conditions(v_automation.conditions, v_context, new.parent_workspace_id, null, null, new.connection_id, null) then
      insert into public.automation_runs (workspace_id, automation_id, connection_id, partner_prospect_id, onboarding_id, trigger_snapshot, status)
      values (new.parent_workspace_id, v_automation.id, new.connection_id, new.partner_prospect_id, v_onboarding_id, v_context, 'running')
      returning id into v_run_id;
      perform public.start_next_automation_step(v_run_id);
    end if;
  end loop;

  return new;
end;
$function$;

revoke all on function public.execute_automation_step(uuid, uuid) from public, anon, authenticated;
revoke all on function public.start_next_automation_step(uuid) from public, anon, authenticated;
revoke all on function public.start_pipeline_run(text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.execute_automation_step(uuid, uuid) to service_role;
grant execute on function public.start_next_automation_step(uuid) to service_role;
grant execute on function public.start_pipeline_run(text, uuid, uuid) to service_role;
-- fire_firm_package_purchase_automations is a trigger function (AFTER UPDATE
-- ON firm_package_purchases): Postgres invokes trigger functions as the
-- table owner regardless of EXECUTE grants, so it takes no explicit grant,
-- matching every other fire_*_automations() trigger function in this schema.
