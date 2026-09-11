-- Closes the "how does staff know a document request was fulfilled" gap:
-- today nothing pushes a notification or surfaces it for review unless a
-- firm hand-builds a Workflow automation for it. This adds a platform-wide
-- (every workspace, no configuration required) in-app notification and a
-- Review Queue entry whenever a document_requests row is fully fulfilled,
-- on top of (not instead of) the existing opt-in Automation trigger.

-- 1. Track whether staff has acknowledged a completed request, so the
-- Review Queue has something to key its "still needs review" list off of.
alter table public.document_requests
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid references auth.users(id);

create or replace function public.mark_document_request_reviewed(p_document_request_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_workspace_id uuid;
begin
  select workspace_id into v_workspace_id from public.document_requests where id = p_document_request_id;
  if v_workspace_id is null then
    raise exception 'document request not found';
  end if;
  if not public.has_permission(v_workspace_id, 'documents.view') then
    raise exception 'insufficient permissions';
  end if;

  update public.document_requests
  set reviewed_at = now(), reviewed_by = auth.uid()
  where id = p_document_request_id and status = 'completed';
end;
$$;

-- 2. The document_request.completed Automation trigger required an exact
-- service_id match with no "any service" option (unlike its siblings
-- document_request.sent, client.service_interest_selected, etc.), so a firm
-- had to build one automation per service just to get a blanket "notify me
-- when documents come in" workflow. Treat a trigger_config with no
-- service_id as "match any service", same pattern already used elsewhere.
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

  if new.entity_type = 'engagement' then
    select workspace_id, client_id, service_id into v_workspace_id, v_client_id, v_service_id
    from public.engagements where id = new.entity_id;
    v_engagement_id := new.entity_id;
  elsif new.entity_type = 'client' then
    v_client_id := new.entity_id;
    select workspace_id into v_workspace_id from public.clients where id = new.entity_id;
    select service_id into v_service_id
    from public.client_service_interests
    where client_id = new.entity_id
    order by created_at desc limit 1;
  else
    return new;
  end if;

  if v_workspace_id is null then
    return new;
  end if;

  v_context := jsonb_build_object('service_id', v_service_id, 'document_request_id', new.id);

  for v_automation in
    select * from public.automations
    where workspace_id = v_workspace_id and is_enabled = true and status = 'published'
      and trigger_type = 'document_request.completed'
      and (
        nullif(trigger_config ->> 'service_id', '') is null
        or trigger_config ->> 'service_id' = v_service_id::text
      )
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

-- 3. Unconditional, all-workspaces notification -- independent of whether
-- the firm has built an Automation at all. Recipient resolution mirrors
-- what send_notification already falls back to elsewhere in this engine:
-- the entity's assigned staff / relationship manager, else the workspace
-- owner.
create or replace function public.notify_staff_document_request_completed()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_workspace_id uuid;
  v_client_id uuid;
  v_recipient_id uuid;
  v_client_name text;
  v_request_title text;
begin
  if new.status <> 'completed' or old.status is not distinct from 'completed' then
    return new;
  end if;

  if new.entity_type = 'engagement' then
    select e.workspace_id, e.client_id, e.assigned_staff_id,
      coalesce(nullif(trim(c.first_name || ' ' || c.last_name), ''), c.business_name, 'A client')
    into v_workspace_id, v_client_id, v_recipient_id, v_client_name
    from public.engagements e
    left join public.clients c on c.id = e.client_id
    where e.id = new.entity_id;
  elsif new.entity_type = 'client' then
    v_client_id := new.entity_id;
    select workspace_id, relationship_manager_id,
      coalesce(nullif(trim(first_name || ' ' || last_name), ''), business_name, 'A client')
    into v_workspace_id, v_recipient_id, v_client_name
    from public.clients where id = new.entity_id;
  else
    return new;
  end if;

  if v_workspace_id is null then
    return new;
  end if;

  if v_recipient_id is null then
    select user_id into v_recipient_id
    from public.workspace_users
    where workspace_id = v_workspace_id and is_owner = true and status = 'active'
    limit 1;
  end if;

  if v_recipient_id is null then
    return new;
  end if;

  v_request_title := coalesce(new.title, 'Document request');

  perform public.create_notification(
    v_workspace_id,
    v_recipient_id,
    'DOCUMENT_REQUEST_COMPLETED',
    'document_request_completed',
    jsonb_build_object('client_name', v_client_name, 'request_title', v_request_title),
    array['In-App'],
    'Medium',
    new.entity_type,
    new.entity_id
  );

  return new;
end;
$function$;

drop trigger if exists trg_notify_document_request_completed on public.document_requests;
create trigger trg_notify_document_request_completed
  after update of status on public.document_requests
  for each row execute function public.notify_staff_document_request_completed();

-- 4. Summit Tax & Financial Services and MKB Financial Group LLC: a real,
-- editable Automation (visible/tunable in Settings > Workflows) that adds a
-- concrete task on top of the passive notification above, using the "any
-- service" support just added so it isn't tied to one specific service.
insert into public.automations (workspace_id, name, slug, description, trigger_type, trigger_config, is_enabled, status)
values (
  'b41f7ee8-e811-4d4d-8156-5ebf43014462',
  'Documents received -> notify staff',
  'documents-received-notify-staff',
  'Once all requested documents are in for any service, creates a task for staff to review them.',
  'document_request.completed',
  '{}'::jsonb,
  true,
  'published'
)
on conflict (workspace_id, slug) do nothing;

insert into public.automation_steps (automation_id, display_order, action_type, action_config)
select id, 0, 'create_task', jsonb_build_object(
  'title', 'Review submitted documents',
  'description', 'A client has submitted all requested documents. Review what came in.',
  'due_in_days', '2',
  'priority', 'medium',
  'assigned_staff_id', '94161e3f-ce7e-4626-8d0d-abef5350cf7c'
)
from public.automations
where slug = 'documents-received-notify-staff' and workspace_id = 'b41f7ee8-e811-4d4d-8156-5ebf43014462'
  and not exists (
    select 1 from public.automation_steps s
    where s.automation_id = public.automations.id
  );

insert into public.automations (workspace_id, name, slug, description, trigger_type, trigger_config, is_enabled, status)
values (
  '9d3e27c8-e7ed-4db0-a0ce-9b2fa0fe23c7',
  'Documents received -> notify staff',
  'documents-received-notify-staff',
  'Once all requested documents are in for any service, creates a task for staff to review them.',
  'document_request.completed',
  '{}'::jsonb,
  true,
  'published'
)
on conflict (workspace_id, slug) do nothing;

insert into public.automation_steps (automation_id, display_order, action_type, action_config)
select id, 0, 'create_task', jsonb_build_object(
  'title', 'Review submitted documents',
  'description', 'A client has submitted all requested documents. Review what came in.',
  'due_in_days', '2',
  'priority', 'medium',
  'assigned_staff_id', '817d1585-9c4f-448c-bc8c-b0c3e7a50904'
)
from public.automations
where slug = 'documents-received-notify-staff' and workspace_id = '9d3e27c8-e7ed-4db0-a0ce-9b2fa0fe23c7'
  and not exists (
    select 1 from public.automation_steps s
    where s.automation_id = public.automations.id
  );
