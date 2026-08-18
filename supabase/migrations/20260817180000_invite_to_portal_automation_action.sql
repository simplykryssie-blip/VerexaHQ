-- New automation action: "Invite client to portal", self-checking so a
-- single step covers "if a portal invite already exists, do nothing; if
-- not, create one and send it" without a general branching mechanism --
-- automation_steps is a strictly linear sequence (display_order only, no
-- per-step condition/branch columns), so an if/else construct isn't
-- something the step model supports; an idempotent action achieves the
-- same described behavior.
--
-- Same reason execute_automation_step can't render/send the invite email
-- itself as send_engagement_letter's action already documents: pure SQL,
-- no pg_net/http extension, can't call the portal-invite email renderer
-- directly. Mirrors that action's pending_engagement_letter_sends pattern:
-- create the real client_portal_users row here (so "does an invite already
-- exist" is checkable immediately, including by this same action run
-- again), queue a pending_portal_invites row, and a new cron route drains
-- it using the exact same renderPortalInviteEmail + sendEmailViaResend the
-- manual "Invite to portal" button already uses.

create table public.pending_portal_invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  client_portal_user_id uuid not null references public.client_portal_users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  error text,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create index pending_portal_invites_status_idx on public.pending_portal_invites (status, created_at);
create index pending_portal_invites_workspace_idx on public.pending_portal_invites (workspace_id);

alter table public.pending_portal_invites enable row level security;
create policy pending_portal_invites_select on public.pending_portal_invites for select
using (public.is_workspace_member(workspace_id));

alter table public.automation_steps drop constraint automation_steps_action_type_check;
alter table public.automation_steps add constraint automation_steps_action_type_check
  check (action_type = any (array[
    'send_email', 'send_sms', 'send_notification', 'create_task', 'assign_user', 'change_stage',
    'request_approval', 'delay', 'webhook', 'escalate', 'send_organizer_template', 'create_engagement',
    'send_engagement_letter', 'send_document_request', 'move_lead_stage', 'mark_lead_lost',
    'convert_lead_to_client', 'update_client', 'create_client', 'move_engagement_stage', 'create_quote',
    'send_quote', 'add_tag', 'remove_tag', 'add_note', 'send_portal_message', 'start_workflow',
    'end_workflow', 'invite_to_portal'
  ]));

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
  v_context jsonb;
  v_status text := 'completed';
  v_error text;
  v_response record;
  v_service record;
  v_new_engagement_id uuid;
  v_stage_id uuid;
  v_doc_request_id uuid;
  v_wf_run_id uuid;
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

  v_context := jsonb_build_object(
    'engagement_number', v_eng.engagement_number,
    'client_name', btrim(coalesce(v_eng.first_name, '') || ' ' || coalesce(v_eng.last_name, '')),
    'firm_name', v_workspace.name,
    'status', v_eng.status
  );

  begin
    if v_step.action_type = 'send_email' then
      if v_eng.primary_email is null then
        raise exception 'Client has no email on file';
      end if;
      insert into public.notification_queue (workspace_id, recipient_email, channel, template_key, payload, entity_type, entity_id, event_type, dedupe_key)
      values (v_run.workspace_id, v_eng.primary_email, 'Email', v_step.action_config->>'template_slug', v_context, 'engagement', v_run.engagement_id, 'automation', 'automation_step:' || p_step_id || ':' || p_run_id)
      on conflict (workspace_id, template_key, dedupe_key) where dedupe_key is not null do nothing;
    elsif v_step.action_type = 'send_sms' then
      if v_eng.primary_phone is null then
        raise exception 'Client has no phone on file';
      end if;
      insert into public.notification_queue (workspace_id, recipient_phone, channel, template_key, payload, entity_type, entity_id, event_type, dedupe_key)
      values (v_run.workspace_id, v_eng.primary_phone, 'SMS', v_step.action_config->>'template_slug', v_context, 'engagement', v_run.engagement_id, 'automation', 'automation_step:' || p_step_id || ':' || p_run_id)
      on conflict (workspace_id, template_key, dedupe_key) where dedupe_key is not null do nothing;
    elsif v_step.action_type = 'create_task' then
      if v_run.engagement_id is null then
        raise exception 'This workflow run has no engagement to attach a task to';
      end if;
      insert into public.tasks (workspace_id, engagement_id, title, description, assigned_staff_id, due_date, priority)
      values (
        v_run.workspace_id, v_run.engagement_id,
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
      insert into public.organizer_responses (workspace_id, client_id, engagement_id, organizer_template_id)
      values (v_run.workspace_id, v_run.client_id, v_run.engagement_id, nullif(v_step.action_config->>'organizer_template_id', '')::uuid);
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
      if v_run.engagement_id is null then
        raise exception 'This workflow run has no engagement to advance';
      end if;

      select ws.id into v_stage_id
      from public.workflow_runs wr
      join public.workflow_stages ws on ws.id = wr.current_stage_id
      where wr.engagement_id = v_run.engagement_id and wr.status = 'Active';

      if v_stage_id is null then
        raise exception 'This engagement has no active pipeline stage to advance';
      end if;

      update public.workflow_stages set status = 'Completed', completed_at = now() where id = v_stage_id;
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
      if nullif(v_step.action_config->>'staff_id', '') is null then
        raise exception 'No recipient configured for this step';
      end if;
      perform public.create_notification(
        v_run.workspace_id,
        (v_step.action_config->>'staff_id')::uuid,
        'automation',
        coalesce(nullif(v_step.action_config->>'template_key', ''), 'automation-step'),
        v_context || jsonb_build_object('message', v_step.action_config->>'message'),
        array['In-App'],
        coalesce(nullif(v_step.action_config->>'priority', ''), 'Medium'),
        case when v_run.engagement_id is not null then 'engagement' else 'client' end,
        coalesce(v_run.engagement_id, v_run.client_id)
      );

    elsif v_step.action_type = 'move_lead_stage' then
      if v_run.client_id is null then
        raise exception 'This workflow run has no client to move';
      end if;
      if not exists (select 1 from public.lead_stages where workspace_id = v_run.workspace_id and key = v_step.action_config->>'lead_stage_key') then
        raise exception 'Unknown lead stage: %', v_step.action_config->>'lead_stage_key';
      end if;
      update public.clients set lifecycle_status = v_step.action_config->>'lead_stage_key' where id = v_run.client_id;

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

      select wr.id, wr.current_stage_id into v_wf_run_id, v_stage_id
      from public.workflow_runs wr
      where wr.engagement_id = v_run.engagement_id and wr.status = 'Active';

      if v_wf_run_id is null then
        raise exception 'This engagement has no active pipeline to move';
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

      -- Self-checking: any existing invite (pending, active, or otherwise)
      -- means "already sent or already has a portal" -- skip silently
      -- rather than raising, so this step is safe to place anywhere without
      -- needing a branch around it.
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
