-- Builds out real condition evaluation for Workflows automations. Until now
-- evaluate_automation_conditions() could only match flat keys already baked
-- into whatever trigger_snapshot context each fire_*_automations trigger
-- happened to build (and there was zero frontend UI to author a condition
-- at all -- automations.conditions has sat unused).
--
-- Most of the condition types the business actually wants (client type,
-- assigned staff, quote amount, task overdue, required documents complete,
-- ...) are live attributes of the client/engagement/quote/task, not values
-- that show up in a given trigger's snapshot. So evaluate_automation_conditions
-- now takes the run's workspace/client/engagement ids and does targeted
-- lookups against those tables, falling back to the raw trigger context for
-- anything else. Every fire_*_automations trigger already resolves those
-- three ids immediately before inserting the automation_runs row, so this
-- is a mechanical one-line change at each of the 22 call sites: pass the
-- same ids already about to be used in the following insert.

create or replace function public.evaluate_automation_conditions(
  p_conditions jsonb,
  p_context jsonb,
  p_workspace_id uuid,
  p_client_id uuid,
  p_engagement_id uuid
)
returns boolean
language plpgsql
stable
set search_path to 'public'
as $function$
declare
  v_cond jsonb;
  v_field text;
  v_op text;
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
  v_match boolean;
begin
  if p_conditions is null or jsonb_array_length(p_conditions) = 0 then
    return true;
  end if;

  -- Every lookup below runs unconditionally (with the relevant id possibly
  -- null, which naturally yields zero rows). plpgsql compiles the CASE
  -- expression further down as a single SQL statement, so a record variable
  -- that was never assigned via SELECT INTO has an indeterminate row type
  -- and errors out even on branches that aren't taken -- guarding these
  -- selects behind "if id is not null" left v_task/v_doc_request/etc.
  -- unassigned whenever a trigger's context didn't include that id, which
  -- broke evaluation of any condition on an unrelated field.
  select * into v_client from public.clients where id = p_client_id;
  select * into v_interest from public.client_service_interests where client_id = p_client_id order by created_at desc limit 1;
  select * into v_portal from public.client_portal_users where client_id = p_client_id order by invited_at desc limit 1;
  select * into v_engagement from public.engagements where id = p_engagement_id;
  select wr.process_id, ws.process_stage_id into v_process_id, v_process_stage_id
  from public.workflow_runs wr
  join public.workflow_stages ws on ws.id = wr.current_stage_id
  where wr.engagement_id = p_engagement_id and wr.status = 'Active';
  select * into v_quote from public.quotes
  where (p_engagement_id is not null and engagement_id = p_engagement_id)
     or (p_client_id is not null and client_id = p_client_id)
  order by created_at desc limit 1;
  select * into v_task from public.tasks where id = nullif(p_context->>'task_id', '')::uuid;
  select * into v_doc_request from public.document_requests where id = nullif(p_context->>'document_request_id', '')::uuid;

  for v_cond in select * from jsonb_array_elements(p_conditions)
  loop
    v_field := v_cond->>'field';
    v_op := coalesce(v_cond->>'op', 'eq');
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
    else
      v_actual := case v_field
        when 'client.lifecycle_status' then v_client.lifecycle_status
        when 'client.client_type' then v_client.client_type
        when 'client.relationship_manager_id' then v_client.relationship_manager_id::text
        when 'client.service_category_id' then v_interest.service_category_id::text
        when 'client.service_id' then v_interest.service_id::text
        when 'client.source' then v_interest.source
        when 'client.portal_status' then v_portal.status
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

    if not v_match then
      return false;
    end if;
  end loop;

  return true;
end;
$function$;

-- The 22 call sites below are unchanged apart from the evaluate_automation_conditions(...)
-- call growing the same workspace/client/engagement id expressions already used
-- on the very next line's automation_runs insert.

create or replace function public.fire_appointment_status_automations()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_automation record;
  v_context jsonb;
  v_run_id uuid;
begin
  if not (TG_OP = 'INSERT' or NEW.status is distinct from OLD.status) then
    return NEW;
  end if;

  v_context := jsonb_build_object('status', NEW.status, 'appointment_title', NEW.title);

  for v_automation in
    select * from public.automations
    where workspace_id = NEW.workspace_id
      and is_enabled = true
      and status = 'published'
      and trigger_type = 'appointment.status_changed'
      and trigger_config ->> 'to_status' = NEW.status
  loop
    if public.evaluate_automation_conditions(v_automation.conditions, v_context, NEW.workspace_id, NEW.client_id, NEW.engagement_id) then
      insert into public.automation_runs (workspace_id, automation_id, engagement_id, client_id, trigger_snapshot, status)
      values (NEW.workspace_id, v_automation.id, NEW.engagement_id, NEW.client_id, v_context, 'running')
      returning id into v_run_id;

      perform public.start_next_automation_step(v_run_id);
    end if;
  end loop;

  return NEW;
end;
$function$;

create or replace function public.fire_client_message_received_automations()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_automation record;
  v_context jsonb;
  v_run_id uuid;
  v_client_id uuid;
  v_engagement_id uuid;
  v_thread record;
begin
  if new.sender_type <> 'client' then
    return new;
  end if;

  select entity_type, entity_id into v_thread from public.message_threads where id = new.thread_id;

  if v_thread.entity_type = 'client' then
    v_client_id := v_thread.entity_id;
  elsif v_thread.entity_type = 'engagement' then
    v_engagement_id := v_thread.entity_id;
    select client_id into v_client_id from public.engagements where id = v_thread.entity_id;
  else
    return new;
  end if;

  v_context := jsonb_build_object('message_id', new.id, 'thread_id', new.thread_id);

  for v_automation in
    select * from public.automations
    where workspace_id = new.workspace_id and is_enabled = true and status = 'published'
      and trigger_type = 'client_message.received'
  loop
    if public.evaluate_automation_conditions(v_automation.conditions, v_context, new.workspace_id, v_client_id, v_engagement_id) then
      insert into public.automation_runs (workspace_id, automation_id, engagement_id, client_id, trigger_snapshot, status)
      values (new.workspace_id, v_automation.id, v_engagement_id, v_client_id, v_context, 'running')
      returning id into v_run_id;
      perform public.start_next_automation_step(v_run_id);
    end if;
  end loop;

  return new;
end;
$function$;

create or replace function public.fire_client_tag_automations()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_added_tag text;
  v_automation record;
  v_context jsonb;
  v_run_id uuid;
  v_engagement_id uuid;
begin
  select id into v_engagement_id from public.engagements
  where client_id = NEW.id and status not in ('Completed', 'Archived')
  order by created_at desc limit 1;

  for v_added_tag in
    select unnest(NEW.tags) except select unnest(coalesce(OLD.tags, array[]::text[]))
  loop
    v_context := jsonb_build_object('tag', v_added_tag, 'client_name', btrim(coalesce(NEW.first_name, '') || ' ' || coalesce(NEW.last_name, '') || coalesce(NEW.business_name, '')));

    for v_automation in
      select * from public.automations
      where workspace_id = NEW.workspace_id
        and is_enabled = true
        and status = 'published'
        and trigger_type = 'client.tag_added'
        and trigger_config ->> 'tag' = v_added_tag
    loop
      if public.evaluate_automation_conditions(v_automation.conditions, v_context, NEW.workspace_id, NEW.id, v_engagement_id) then
        insert into public.automation_runs (workspace_id, automation_id, engagement_id, client_id, trigger_snapshot, status)
        values (NEW.workspace_id, v_automation.id, v_engagement_id, NEW.id, v_context, 'running')
        returning id into v_run_id;

        perform public.start_next_automation_step(v_run_id);
      end if;
    end loop;
  end loop;

  return NEW;
end;
$function$;

create or replace function public.fire_document_request_completed_automations()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
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
  if new.entity_type <> 'engagement' then
    return new;
  end if;

  select workspace_id, client_id, service_id into v_workspace_id, v_client_id, v_service_id
  from public.engagements where id = new.entity_id;

  if v_workspace_id is null then
    return new;
  end if;

  v_engagement_id := new.entity_id;
  v_context := jsonb_build_object('service_id', v_service_id, 'document_request_id', new.id);

  for v_automation in
    select * from public.automations
    where workspace_id = v_workspace_id and is_enabled = true and status = 'published'
      and trigger_type = 'document_request.completed'
      and trigger_config ->> 'service_id' = v_service_id::text
  loop
    if public.evaluate_automation_conditions(v_automation.conditions, v_context, v_workspace_id, v_client_id, v_engagement_id) then
      insert into public.automation_runs (workspace_id, automation_id, engagement_id, client_id, trigger_snapshot, status)
      values (v_workspace_id, v_automation.id, v_engagement_id, v_client_id, v_context, 'running')
      returning id into v_run_id;
      perform public.start_next_automation_step(v_run_id);
    end if;
  end loop;

  return new;
end;
$function$;

create or replace function public.fire_document_request_sent_automations()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_automation record;
  v_context jsonb;
  v_run_id uuid;
  v_client_id uuid;
  v_engagement_id uuid;
begin
  if new.entity_type = 'client' then
    v_client_id := new.entity_id;
  elsif new.entity_type = 'engagement' then
    v_engagement_id := new.entity_id;
    select client_id into v_client_id from public.engagements where id = new.entity_id;
  else
    return new;
  end if;

  v_context := jsonb_build_object('document_request_id', new.id, 'title', new.title);

  for v_automation in
    select * from public.automations
    where workspace_id = new.workspace_id and is_enabled = true and status = 'published'
      and trigger_type = 'document_request.sent'
  loop
    if public.evaluate_automation_conditions(v_automation.conditions, v_context, new.workspace_id, v_client_id, v_engagement_id) then
      insert into public.automation_runs (workspace_id, automation_id, engagement_id, client_id, trigger_snapshot, status)
      values (new.workspace_id, v_automation.id, v_engagement_id, v_client_id, v_context, 'running')
      returning id into v_run_id;
      perform public.start_next_automation_step(v_run_id);
    end if;
  end loop;

  return new;
end;
$function$;

create or replace function public.fire_document_uploaded_automations()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_automation record;
  v_context jsonb;
  v_run_id uuid;
  v_client_id uuid;
  v_engagement_id uuid;
begin
  if new.entity_type = 'client' then
    v_client_id := new.entity_id;
  elsif new.entity_type = 'engagement' then
    v_engagement_id := new.entity_id;
    select client_id into v_client_id from public.engagements where id = new.entity_id;
  else
    return new;
  end if;

  v_context := jsonb_build_object('attachment_id', new.id, 'file_name', new.file_name);

  for v_automation in
    select * from public.automations
    where workspace_id = new.workspace_id and is_enabled = true and status = 'published'
      and trigger_type = 'document.uploaded'
  loop
    if public.evaluate_automation_conditions(v_automation.conditions, v_context, new.workspace_id, v_client_id, v_engagement_id) then
      insert into public.automation_runs (workspace_id, automation_id, engagement_id, client_id, trigger_snapshot, status)
      values (new.workspace_id, v_automation.id, v_engagement_id, v_client_id, v_context, 'running')
      returning id into v_run_id;
      perform public.start_next_automation_step(v_run_id);
    end if;
  end loop;

  return new;
end;
$function$;

create or replace function public.fire_engagement_created_automations()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_automation record;
  v_context jsonb;
  v_run_id uuid;
begin
  if NEW.service_id is null then
    return NEW;
  end if;

  v_context := jsonb_build_object('service_id', NEW.service_id);

  for v_automation in
    select * from public.automations
    where workspace_id = NEW.workspace_id
      and is_enabled = true
      and status = 'published'
      and trigger_type = 'engagement.created'
      and trigger_config ->> 'service_id' = NEW.service_id::text
  loop
    if public.evaluate_automation_conditions(v_automation.conditions, v_context, NEW.workspace_id, NEW.client_id, NEW.id) then
      insert into public.automation_runs (workspace_id, automation_id, engagement_id, client_id, trigger_snapshot, status)
      values (NEW.workspace_id, v_automation.id, NEW.id, NEW.client_id, v_context, 'running')
      returning id into v_run_id;

      perform public.start_next_automation_step(v_run_id);
    end if;
  end loop;

  return NEW;
end;
$function$;

create or replace function public.fire_engagement_letter_signed_automations()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
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
    if public.evaluate_automation_conditions(v_automation.conditions, v_context, v_workspace_id, v_client_id, v_engagement_id) then
      insert into public.automation_runs (workspace_id, automation_id, engagement_id, client_id, trigger_snapshot, status)
      values (v_workspace_id, v_automation.id, v_engagement_id, v_client_id, v_context, 'running')
      returning id into v_run_id;
      perform public.start_next_automation_step(v_run_id);
    end if;
  end loop;

  return new;
end;
$function$;

create or replace function public.fire_engagement_status_automations()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_automation record;
  v_context jsonb;
  v_run_id uuid;
begin
  if NEW.status is distinct from OLD.status then
    v_context := jsonb_build_object(
      'priority', NEW.priority,
      'service_id', NEW.service_id,
      'engagement_number', NEW.engagement_number,
      'status', NEW.status
    );

    for v_automation in
      select * from public.automations
      where workspace_id = NEW.workspace_id
        and is_enabled = true
        and status = 'published'
        and trigger_type = 'engagement.status_changed'
        and trigger_config ->> 'to_status' = NEW.status
    loop
      if public.evaluate_automation_conditions(v_automation.conditions, v_context, NEW.workspace_id, NEW.client_id, NEW.id) then
        insert into public.automation_runs (workspace_id, automation_id, engagement_id, client_id, trigger_snapshot, status)
        values (NEW.workspace_id, v_automation.id, NEW.id, NEW.client_id, v_context, 'running')
        returning id into v_run_id;

        perform public.start_next_automation_step(v_run_id);
      end if;
    end loop;
  end if;

  return NEW;
end;
$function$;

create or replace function public.fire_lead_assigned_automations()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_automation record;
  v_context jsonb;
  v_run_id uuid;
begin
  if new.relationship_manager_id is not distinct from old.relationship_manager_id then
    return new;
  end if;
  if new.lifecycle_status <> 'lead'
     and not exists (select 1 from public.lead_stages where workspace_id = new.workspace_id and key = new.lifecycle_status) then
    return new;
  end if;

  v_context := jsonb_build_object('assigned_staff_id', new.relationship_manager_id);

  for v_automation in
    select * from public.automations
    where workspace_id = new.workspace_id and is_enabled = true and status = 'published'
      and trigger_type = 'lead.assigned'
  loop
    if public.evaluate_automation_conditions(v_automation.conditions, v_context, new.workspace_id, new.id, null) then
      insert into public.automation_runs (workspace_id, automation_id, client_id, trigger_snapshot, status)
      values (new.workspace_id, v_automation.id, new.id, v_context, 'running')
      returning id into v_run_id;
      perform public.start_next_automation_step(v_run_id);
    end if;
  end loop;

  return new;
end;
$function$;

create or replace function public.fire_lead_created_automations()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_automation record;
  v_context jsonb;
  v_run_id uuid;
begin
  if new.lifecycle_status <> 'lead' then
    return new;
  end if;

  v_context := jsonb_build_object('lifecycle_status', new.lifecycle_status);

  for v_automation in
    select * from public.automations
    where workspace_id = new.workspace_id and is_enabled = true and status = 'published'
      and trigger_type = 'lead.created'
  loop
    if public.evaluate_automation_conditions(v_automation.conditions, v_context, new.workspace_id, new.id, null) then
      insert into public.automation_runs (workspace_id, automation_id, client_id, trigger_snapshot, status)
      values (new.workspace_id, v_automation.id, new.id, v_context, 'running')
      returning id into v_run_id;
      perform public.start_next_automation_step(v_run_id);
    end if;
  end loop;

  return new;
end;
$function$;

create or replace function public.fire_lead_status_changed_automations()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_automation record;
  v_context jsonb;
  v_run_id uuid;
  v_is_stage boolean;
  v_was_lead_pipeline boolean;
begin
  if new.lifecycle_status is not distinct from old.lifecycle_status then
    return new;
  end if;

  v_context := jsonb_build_object('to_status', new.lifecycle_status, 'from_status', old.lifecycle_status);
  v_is_stage := exists (select 1 from public.lead_stages where workspace_id = new.workspace_id and key = new.lifecycle_status);
  v_was_lead_pipeline := old.lifecycle_status = 'lead'
    or exists (select 1 from public.lead_stages where workspace_id = old.workspace_id and key = old.lifecycle_status);

  for v_automation in
    select * from public.automations
    where workspace_id = new.workspace_id and is_enabled = true and status = 'published'
      and (
        (trigger_type = 'lead.status_changed' and trigger_config ->> 'to_status' = new.lifecycle_status)
        or (v_is_stage and trigger_type = 'lead.stage_entered' and trigger_config ->> 'stage_key' = new.lifecycle_status)
        or (v_was_lead_pipeline and new.lifecycle_status = 'active' and trigger_type = 'lead.converted_to_client')
        or (new.lifecycle_status = 'lost' and trigger_type = 'lead.marked_lost')
      )
  loop
    if public.evaluate_automation_conditions(v_automation.conditions, v_context, new.workspace_id, new.id, null) then
      insert into public.automation_runs (workspace_id, automation_id, client_id, trigger_snapshot, status)
      values (new.workspace_id, v_automation.id, new.id, v_context, 'running')
      returning id into v_run_id;
      perform public.start_next_automation_step(v_run_id);
    end if;
  end loop;

  return new;
end;
$function$;

create or replace function public.fire_lead_updated_automations()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_automation record;
  v_context jsonb;
  v_run_id uuid;
begin
  if old.lifecycle_status <> 'lead'
     and not exists (select 1 from public.lead_stages where workspace_id = old.workspace_id and key = old.lifecycle_status) then
    return new;
  end if;

  v_context := jsonb_build_object('lifecycle_status', new.lifecycle_status);

  for v_automation in
    select * from public.automations
    where workspace_id = new.workspace_id and is_enabled = true and status = 'published'
      and trigger_type = 'lead.updated'
  loop
    if public.evaluate_automation_conditions(v_automation.conditions, v_context, new.workspace_id, new.id, null) then
      insert into public.automation_runs (workspace_id, automation_id, client_id, trigger_snapshot, status)
      values (new.workspace_id, v_automation.id, new.id, v_context, 'running')
      returning id into v_run_id;
      perform public.start_next_automation_step(v_run_id);
    end if;
  end loop;

  return new;
end;
$function$;

create or replace function public.fire_organizer_submitted_automations()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_automation record;
  v_context jsonb;
  v_run_id uuid;
  v_engagement_id uuid;
begin
  if not (
    (TG_OP = 'INSERT' and NEW.status in ('submitted', 'reviewed'))
    or (TG_OP = 'UPDATE' and NEW.status in ('submitted', 'reviewed') and OLD.status is distinct from NEW.status)
  ) then
    return NEW;
  end if;

  v_engagement_id := NEW.engagement_id;
  if v_engagement_id is null then
    select id into v_engagement_id from public.engagements
    where client_id = NEW.client_id and status not in ('Completed', 'Archived')
    order by created_at desc limit 1;
  end if;

  v_context := jsonb_build_object('organizer_template_id', NEW.organizer_template_id, 'status', NEW.status, 'response_id', NEW.id);

  for v_automation in
    select * from public.automations
    where workspace_id = NEW.workspace_id
      and is_enabled = true
      and status = 'published'
      and trigger_type = 'organizer.submitted'
      and trigger_config ->> 'organizer_template_id' = NEW.organizer_template_id::text
  loop
    if public.evaluate_automation_conditions(v_automation.conditions, v_context, NEW.workspace_id, NEW.client_id, v_engagement_id) then
      insert into public.automation_runs (workspace_id, automation_id, engagement_id, client_id, trigger_snapshot, status)
      values (NEW.workspace_id, v_automation.id, v_engagement_id, NEW.client_id, v_context, 'running')
      returning id into v_run_id;

      perform public.start_next_automation_step(v_run_id);
    end if;
  end loop;

  return NEW;
end;
$function$;

create or replace function public.fire_portal_created_automations()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_automation record;
  v_context jsonb;
  v_run_id uuid;
  v_engagement_id uuid;
begin
  if not (NEW.status = 'active' and (TG_OP = 'INSERT' or OLD.status is distinct from NEW.status)) then
    return NEW;
  end if;

  select id into v_engagement_id from public.engagements
  where client_id = NEW.client_id and status not in ('Completed', 'Archived')
  order by created_at desc limit 1;

  v_context := jsonb_build_object('client_id', NEW.client_id);

  for v_automation in
    select * from public.automations
    where workspace_id = NEW.workspace_id
      and is_enabled = true
      and status = 'published'
      and trigger_type = 'client.portal_created'
  loop
    if public.evaluate_automation_conditions(v_automation.conditions, v_context, NEW.workspace_id, NEW.client_id, v_engagement_id) then
      insert into public.automation_runs (workspace_id, automation_id, engagement_id, client_id, trigger_snapshot, status)
      values (NEW.workspace_id, v_automation.id, v_engagement_id, NEW.client_id, v_context, 'running')
      returning id into v_run_id;

      perform public.start_next_automation_step(v_run_id);
    end if;
  end loop;

  return NEW;
end;
$function$;

create or replace function public.fire_quote_created_automations()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_automation record;
  v_context jsonb;
  v_run_id uuid;
begin
  v_context := jsonb_build_object('quote_id', new.id, 'service_id', new.service_id, 'total_amount', new.total_amount);

  for v_automation in
    select * from public.automations
    where workspace_id = new.workspace_id and is_enabled = true and status = 'published'
      and trigger_type = 'quote.created'
      and (trigger_config ->> 'service_id' is null or trigger_config ->> 'service_id' = new.service_id::text)
  loop
    if public.evaluate_automation_conditions(v_automation.conditions, v_context, new.workspace_id, new.client_id, new.engagement_id) then
      insert into public.automation_runs (workspace_id, automation_id, engagement_id, client_id, trigger_snapshot, status)
      values (new.workspace_id, v_automation.id, new.engagement_id, new.client_id, v_context, 'running')
      returning id into v_run_id;
      perform public.start_next_automation_step(v_run_id);
    end if;
  end loop;

  return new;
end;
$function$;

create or replace function public.fire_quote_status_changed_automations()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_automation record;
  v_context jsonb;
  v_run_id uuid;
  v_trigger_type text;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  v_trigger_type := case new.status
    when 'sent' then 'quote.sent'
    when 'accepted' then 'quote.accepted'
    when 'declined' then 'quote.declined'
    else null
  end;
  if v_trigger_type is null then
    return new;
  end if;

  v_context := jsonb_build_object('quote_id', new.id, 'service_id', new.service_id, 'total_amount', new.total_amount);

  for v_automation in
    select * from public.automations
    where workspace_id = new.workspace_id and is_enabled = true and status = 'published'
      and trigger_type = v_trigger_type
      and (trigger_config ->> 'service_id' is null or trigger_config ->> 'service_id' = new.service_id::text)
  loop
    if public.evaluate_automation_conditions(v_automation.conditions, v_context, new.workspace_id, new.client_id, new.engagement_id) then
      insert into public.automation_runs (workspace_id, automation_id, engagement_id, client_id, trigger_snapshot, status)
      values (new.workspace_id, v_automation.id, new.engagement_id, new.client_id, v_context, 'running')
      returning id into v_run_id;
      perform public.start_next_automation_step(v_run_id);
    end if;
  end loop;

  return new;
end;
$function$;

create or replace function public.fire_service_interest_automations()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_automation record;
  v_context jsonb;
  v_run_id uuid;
  v_engagement_id uuid;
begin
  select id into v_engagement_id from public.engagements
  where client_id = NEW.client_id and status not in ('Completed', 'Archived')
  order by created_at desc limit 1;

  v_context := jsonb_build_object('service_id', NEW.service_id, 'service_category_id', NEW.service_category_id, 'source', NEW.source);

  for v_automation in
    select * from public.automations
    where workspace_id = NEW.workspace_id
      and is_enabled = true
      and status = 'published'
      and trigger_type = 'client.service_interest_selected'
      and trigger_config ->> 'service_id' = NEW.service_id::text
  loop
    if public.evaluate_automation_conditions(v_automation.conditions, v_context, NEW.workspace_id, NEW.client_id, v_engagement_id) then
      insert into public.automation_runs (workspace_id, automation_id, engagement_id, client_id, trigger_snapshot, status)
      values (NEW.workspace_id, v_automation.id, v_engagement_id, NEW.client_id, v_context, 'running')
      returning id into v_run_id;

      perform public.start_next_automation_step(v_run_id);
    end if;
  end loop;

  return NEW;
end;
$function$;

create or replace function public.fire_task_completed_automations()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_automation record;
  v_context jsonb;
  v_run_id uuid;
  v_client_id uuid;
begin
  if new.status <> 'completed' or old.status is not distinct from 'completed' then
    return new;
  end if;

  select client_id into v_client_id from public.engagements where id = new.engagement_id;

  v_context := jsonb_build_object('task_id', new.id, 'title', new.title);

  for v_automation in
    select * from public.automations
    where workspace_id = new.workspace_id and is_enabled = true and status = 'published'
      and trigger_type = 'task.completed'
  loop
    if public.evaluate_automation_conditions(v_automation.conditions, v_context, new.workspace_id, v_client_id, new.engagement_id) then
      insert into public.automation_runs (workspace_id, automation_id, engagement_id, client_id, trigger_snapshot, status)
      values (new.workspace_id, v_automation.id, new.engagement_id, v_client_id, v_context, 'running')
      returning id into v_run_id;
      perform public.start_next_automation_step(v_run_id);
    end if;
  end loop;

  return new;
end;
$function$;

create or replace function public.fire_task_created_automations()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_automation record;
  v_context jsonb;
  v_run_id uuid;
  v_client_id uuid;
begin
  select client_id into v_client_id from public.engagements where id = new.engagement_id;

  v_context := jsonb_build_object('task_id', new.id, 'title', new.title, 'priority', new.priority);

  for v_automation in
    select * from public.automations
    where workspace_id = new.workspace_id and is_enabled = true and status = 'published'
      and trigger_type = 'task.created'
  loop
    if public.evaluate_automation_conditions(v_automation.conditions, v_context, new.workspace_id, v_client_id, new.engagement_id) then
      insert into public.automation_runs (workspace_id, automation_id, engagement_id, client_id, trigger_snapshot, status)
      values (new.workspace_id, v_automation.id, new.engagement_id, v_client_id, v_context, 'running')
      returning id into v_run_id;
      perform public.start_next_automation_step(v_run_id);
    end if;
  end loop;

  return new;
end;
$function$;

create or replace function public.fire_workflow_stage_entered_automations()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_automation record;
  v_context jsonb;
  v_run_id uuid;
  v_engagement_id uuid;
  v_client_id uuid;
  v_workspace_id uuid;
begin
  if new.status <> 'In Progress' or old.status is not distinct from 'In Progress' then
    return new;
  end if;

  select wr.engagement_id, wr.workspace_id into v_engagement_id, v_workspace_id
  from public.workflow_runs wr where wr.id = new.workflow_run_id;

  if v_engagement_id is null then
    return new;
  end if;

  select client_id into v_client_id from public.engagements where id = v_engagement_id;

  v_context := jsonb_build_object('process_stage_id', new.process_stage_id);

  for v_automation in
    select * from public.automations
    where workspace_id = v_workspace_id and is_enabled = true and status = 'published'
      and trigger_type = 'engagement.stage_entered'
      and trigger_config ->> 'process_stage_id' = new.process_stage_id::text
  loop
    if public.evaluate_automation_conditions(v_automation.conditions, v_context, v_workspace_id, v_client_id, v_engagement_id) then
      insert into public.automation_runs (workspace_id, automation_id, engagement_id, client_id, trigger_snapshot, status)
      values (v_workspace_id, v_automation.id, v_engagement_id, v_client_id, v_context, 'running')
      returning id into v_run_id;
      perform public.start_next_automation_step(v_run_id);
    end if;
  end loop;

  return new;
end;
$function$;

create or replace function public.fire_task_overdue_automations()
returns int
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  r record;
  v_automation record;
  v_context jsonb;
  v_run_id uuid;
  v_count int := 0;
begin
  for r in
    select t.id, t.workspace_id, t.engagement_id, t.title, t.due_date, e.client_id
    from public.tasks t
    join public.engagements e on e.id = t.engagement_id
    where t.status <> 'completed'
      and t.due_date is not null
      and t.due_date < now()
      and t.overdue_flagged_at is null
  loop
    v_context := jsonb_build_object('task_id', r.id, 'title', r.title, 'due_date', r.due_date);

    for v_automation in
      select * from public.automations
      where workspace_id = r.workspace_id and is_enabled = true and status = 'published'
        and trigger_type = 'task.overdue'
    loop
      if public.evaluate_automation_conditions(v_automation.conditions, v_context, r.workspace_id, r.client_id, r.engagement_id) then
        insert into public.automation_runs (workspace_id, automation_id, engagement_id, client_id, trigger_snapshot, status)
        values (r.workspace_id, v_automation.id, r.engagement_id, r.client_id, v_context, 'running')
        returning id into v_run_id;
        perform public.start_next_automation_step(v_run_id);
      end if;
    end loop;

    update public.tasks set overdue_flagged_at = now() where id = r.id;
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$function$;
