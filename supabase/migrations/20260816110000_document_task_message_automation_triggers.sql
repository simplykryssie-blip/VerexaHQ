-- Document/task/message triggers for the Workflows engine.
-- document_requests and attachments are both client-or-engagement-scoped
-- (entity_type/entity_id), so each resolves client_id/engagement_id from
-- whichever entity_type applies. tasks.engagement_id is NOT NULL, so it
-- always resolves via the engagement. messages resolves client_id via
-- its thread's entity_type/entity_id, same pattern as the other two.
--
-- "Required documents completed" isn't new -- it's the existing
-- document_request.completed trigger, unchanged.

-- document_request.sent: document_requests has no separate draft/sent
-- state like quotes -- a row appearing is the request going out, so this
-- fires on INSERT.
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
    if public.evaluate_automation_conditions(v_automation.conditions, v_context) then
      insert into public.automation_runs (workspace_id, automation_id, engagement_id, client_id, trigger_snapshot, status)
      values (new.workspace_id, v_automation.id, v_engagement_id, v_client_id, v_context, 'running')
      returning id into v_run_id;
      perform public.start_next_automation_step(v_run_id);
    end if;
  end loop;

  return new;
end;
$function$;

create trigger trg_fire_document_request_sent_automations
  after insert on public.document_requests
  for each row execute function public.fire_document_request_sent_automations();

-- document.uploaded: any new attachment, client- or engagement-scoped,
-- regardless of who uploaded it.
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
    if public.evaluate_automation_conditions(v_automation.conditions, v_context) then
      insert into public.automation_runs (workspace_id, automation_id, engagement_id, client_id, trigger_snapshot, status)
      values (new.workspace_id, v_automation.id, v_engagement_id, v_client_id, v_context, 'running')
      returning id into v_run_id;
      perform public.start_next_automation_step(v_run_id);
    end if;
  end loop;

  return new;
end;
$function$;

create trigger trg_fire_document_uploaded_automations
  after insert on public.attachments
  for each row execute function public.fire_document_uploaded_automations();

-- task.created / task.completed: same underlying pattern as everywhere
-- else -- created is INSERT, completed is a status transition.
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
    if public.evaluate_automation_conditions(v_automation.conditions, v_context) then
      insert into public.automation_runs (workspace_id, automation_id, engagement_id, client_id, trigger_snapshot, status)
      values (new.workspace_id, v_automation.id, new.engagement_id, v_client_id, v_context, 'running')
      returning id into v_run_id;
      perform public.start_next_automation_step(v_run_id);
    end if;
  end loop;

  return new;
end;
$function$;

create trigger trg_fire_task_created_automations
  after insert on public.tasks
  for each row execute function public.fire_task_created_automations();

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
    if public.evaluate_automation_conditions(v_automation.conditions, v_context) then
      insert into public.automation_runs (workspace_id, automation_id, engagement_id, client_id, trigger_snapshot, status)
      values (new.workspace_id, v_automation.id, new.engagement_id, v_client_id, v_context, 'running')
      returning id into v_run_id;
      perform public.start_next_automation_step(v_run_id);
    end if;
  end loop;

  return new;
end;
$function$;

create trigger trg_fire_task_completed_automations
  after update of status on public.tasks
  for each row execute function public.fire_task_completed_automations();

-- client_message.received: a client (not staff) sends a message.
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
    if public.evaluate_automation_conditions(v_automation.conditions, v_context) then
      insert into public.automation_runs (workspace_id, automation_id, engagement_id, client_id, trigger_snapshot, status)
      values (new.workspace_id, v_automation.id, v_engagement_id, v_client_id, v_context, 'running')
      returning id into v_run_id;
      perform public.start_next_automation_step(v_run_id);
    end if;
  end loop;

  return new;
end;
$function$;

create trigger trg_fire_client_message_received_automations
  after insert on public.messages
  for each row execute function public.fire_client_message_received_automations();
