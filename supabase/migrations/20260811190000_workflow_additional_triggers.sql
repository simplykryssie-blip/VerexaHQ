-- Workflows only ever listened for one trigger (engagement.status_changed).
-- This adds the other three the schema was designed for: a pipeline stage
-- change, an organizer being submitted, and a tag being added to a client.
-- The last two are genuinely client-level, not engagement-level, so
-- automation_runs needs a client_id of its own -- engagement_id stays
-- nullable and gets resolved to the client's most recent open engagement
-- when one exists, purely so send_email/send_sms/create_task keep working
-- the same way they always have. execute_automation_step() is updated to
-- fall back to a direct client lookup when there's no engagement at all.

alter table public.automation_runs
  add column if not exists client_id uuid references public.clients(id) on delete cascade;

create index if not exists automation_runs_client_id_idx on public.automation_runs(client_id);

-- Existing trigger, now also stamping client_id.
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
      if public.evaluate_automation_conditions(v_automation.conditions, v_context) then
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

-- New: pipeline stage change.
create or replace function public.fire_pipeline_stage_automations()
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
  if NEW.pipeline_stage_id is distinct from OLD.pipeline_stage_id and NEW.pipeline_stage_id is not null then
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
        and trigger_type = 'engagement.pipeline_stage_changed'
        and trigger_config ->> 'pipeline_stage_id' = NEW.pipeline_stage_id::text
    loop
      if public.evaluate_automation_conditions(v_automation.conditions, v_context) then
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

drop trigger if exists trg_fire_pipeline_stage_automations on public.engagements;
create trigger trg_fire_pipeline_stage_automations
  after update of pipeline_stage_id on public.engagements
  for each row execute function public.fire_pipeline_stage_automations();

-- New: organizer submitted. Runs on both a fresh submitted-on-insert row
-- (the public intake path) and a status update into submitted/reviewed
-- (the staff-sent path) -- same dual path flip_lead_on_organizer_submission
-- already handles on this table.
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

  v_context := jsonb_build_object('organizer_template_id', NEW.organizer_template_id, 'status', NEW.status);

  for v_automation in
    select * from public.automations
    where workspace_id = NEW.workspace_id
      and is_enabled = true
      and status = 'published'
      and trigger_type = 'organizer.submitted'
      and trigger_config ->> 'organizer_template_id' = NEW.organizer_template_id::text
  loop
    if public.evaluate_automation_conditions(v_automation.conditions, v_context) then
      insert into public.automation_runs (workspace_id, automation_id, engagement_id, client_id, trigger_snapshot, status)
      values (NEW.workspace_id, v_automation.id, v_engagement_id, NEW.client_id, v_context, 'running')
      returning id into v_run_id;

      perform public.start_next_automation_step(v_run_id);
    end if;
  end loop;

  return NEW;
end;
$function$;

drop trigger if exists trg_fire_organizer_submitted_automations on public.organizer_responses;
create trigger trg_fire_organizer_submitted_automations
  after insert or update of status on public.organizer_responses
  for each row execute function public.fire_organizer_submitted_automations();

-- New: tag added to a client.
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
      if public.evaluate_automation_conditions(v_automation.conditions, v_context) then
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

drop trigger if exists trg_fire_client_tag_automations on public.clients;
create trigger trg_fire_client_tag_automations
  after update of tags on public.clients
  for each row execute function public.fire_client_tag_automations();

-- execute_automation_step now resolves client context from client_id
-- directly when there's no engagement, instead of assuming one always
-- exists. create_task still requires an engagement (tasks.engagement_id is
-- NOT NULL in this schema) -- with none available it fails and logs a clear
-- error rather than silently doing nothing, same as any other action error.
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
