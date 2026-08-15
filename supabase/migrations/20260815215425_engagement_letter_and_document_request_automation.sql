-- Phase 7 of the tax-client process: two new things staff can wire together
-- in Workflows -- send the engagement letter automatically when an
-- engagement is created, and (on a separate trigger firing once it's
-- signed) advance the pipeline to the next stage and auto-send a document
-- request. Two automations, chained by real events, not one hardcoded flow.

-- 1. Queue table for the async part of "send an engagement letter."
-- execute_automation_step is pure SQL and can't call Supabase Storage to
-- upload the rendered HTML (the same reason send_email/send_sms only
-- enqueue into notification_queue rather than calling Resend/Twilio
-- directly) -- a new cron route drains this the same way
-- dispatch-notifications drains notification_queue.
create table public.pending_engagement_letter_sends (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  engagement_id uuid not null references public.engagements(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  engagement_letter_template_id uuid not null references public.engagement_letter_templates(id),
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  error text,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create index pending_engagement_letter_sends_status_idx on public.pending_engagement_letter_sends (status, created_at) where status = 'pending';

alter table public.pending_engagement_letter_sends enable row level security;

create policy pending_engagement_letter_sends_select on public.pending_engagement_letter_sends
  for select using (public.is_workspace_member(workspace_id));

-- 2. Two new action_types.
alter table public.automation_steps drop constraint automation_steps_action_type_check;
alter table public.automation_steps add constraint automation_steps_action_type_check
  check (action_type = ANY (ARRAY[
    'send_email'::text, 'send_sms'::text, 'send_notification'::text, 'create_task'::text,
    'assign_user'::text, 'change_stage'::text, 'request_approval'::text, 'delay'::text,
    'webhook'::text, 'escalate'::text, 'send_organizer_template'::text, 'create_engagement'::text,
    'send_engagement_letter'::text, 'send_document_request'::text
  ]));

-- 3. execute_automation_step gains send_engagement_letter, change_stage,
-- and send_document_request branches, alongside the 5 already implemented.
-- change_stage completes the engagement's current workflow_stage --
-- trg_advance_workflow_on_stage_completed (pre-existing) then auto-advances
-- to the next stage, exactly what the manual "Approve" button in
-- StageReviewActions.tsx already does. send_document_request inlines
-- create_document_request's logic minus its has_permission check, same
-- reasoning as create_engagement's branch below it: this is a system-
-- initiated side effect of the automation firing, not a staff action.
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

-- 4. New trigger type: engagement_letter.signed. Fires when a signature
-- request tied to an engagement (via its attachment's entity_type/entity_id
-- -- signature_requests has no direct engagement_id column) and carrying
-- an engagement_letter_template_id transitions into 'completed'. Mirrors
-- fire_engagement_created_automations' shape: mandatory service_id match
-- in trigger_config, same as engagement.created and
-- client.service_interest_selected already require.
create or replace function public.fire_engagement_letter_signed_automations()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_automation record;
  v_context jsonb;
  v_run_id uuid;
  v_engagement_id uuid;
  v_client_id uuid;
  v_service_id uuid;
  v_workspace_id uuid;
begin
  if new.status <> 'completed' or old.status is not distinct from 'completed' then
    return new;
  end if;
  if new.engagement_letter_template_id is null then
    return new;
  end if;

  select a.entity_id into v_engagement_id
  from public.attachments a
  where a.id = new.attachment_id and a.entity_type = 'engagement';

  if v_engagement_id is null then
    return new;
  end if;

  select workspace_id, client_id, service_id into v_workspace_id, v_client_id, v_service_id
  from public.engagements where id = v_engagement_id;

  if v_workspace_id is null then
    return new;
  end if;

  v_context := jsonb_build_object('service_id', v_service_id, 'engagement_letter_template_id', new.engagement_letter_template_id);

  for v_automation in
    select * from public.automations
    where workspace_id = v_workspace_id and is_enabled = true and status = 'published'
      and trigger_type = 'engagement_letter.signed'
      and trigger_config ->> 'service_id' = v_service_id::text
  loop
    if public.evaluate_automation_conditions(v_automation.conditions, v_context) then
      insert into public.automation_runs (workspace_id, automation_id, engagement_id, client_id, trigger_snapshot, status)
      values (v_workspace_id, v_automation.id, v_engagement_id, v_client_id, v_context, 'running')
      returning id into v_run_id;
      perform public.start_next_automation_step(v_run_id);
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_fire_engagement_letter_signed_automations on public.signature_requests;
create trigger trg_fire_engagement_letter_signed_automations
  after update of status on public.signature_requests
  for each row execute function public.fire_engagement_letter_signed_automations();
