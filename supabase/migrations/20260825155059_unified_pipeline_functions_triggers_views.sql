-- Rewrites every function/trigger/view that touched
-- lead_pipeline_runs/lead_pipeline_stages or workflow_runs/workflow_stages
-- to read/write the new unified pipeline_runs/pipeline_stages tables
-- instead. Purely additive -- the old tables, functions, and triggers are
-- left alone here and only dropped in the cutover migration once this is
-- verified end to end.

-- 1. start_lead_pipeline_run + start_engagement_workflow -> one function.
-- SECURITY DEFINER (start_engagement_workflow wasn't before -- it relied on
-- workflow_runs' now-removed INSERT policy; this is simpler and matches
-- start_lead_pipeline_run's existing convention).
create or replace function public.start_pipeline_run(p_entity_type text, p_entity_id uuid, p_process_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_run_id uuid;
  v_workspace_id uuid;
begin
  if p_entity_type = 'client' then
    select workspace_id into v_workspace_id from public.clients where id = p_entity_id;
  elsif p_entity_type = 'engagement' then
    select workspace_id into v_workspace_id from public.engagements where id = p_entity_id;
  else
    raise exception 'unsupported entity_type: %', p_entity_type;
  end if;

  if v_workspace_id is null then
    raise exception '% not found', p_entity_type;
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

-- 2. advance_lead_pipeline_stage -> generalized, used by StageEditor.tsx's
-- "move this card to a different stage" action. No longer errors when an
-- active run exists in a different pipeline -- it just starts a fresh run
-- in the requested pipeline, same permissive concurrent-pipeline model
-- already shipped for leads.
create or replace function public.advance_pipeline_stage(p_entity_type text, p_entity_id uuid, p_process_id uuid, p_process_stage_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_workspace_id uuid;
  v_run_id uuid;
  v_stage_id uuid;
  v_target_stage_id uuid;
  v_target_order int;
  v_current_order int;
  v_loop_guard int;
begin
  if p_entity_type = 'client' then
    select workspace_id into v_workspace_id from public.clients where id = p_entity_id;
  elsif p_entity_type = 'engagement' then
    select workspace_id into v_workspace_id from public.engagements where id = p_entity_id;
  else
    raise exception 'unsupported entity_type: %', p_entity_type;
  end if;
  if v_workspace_id is null then
    raise exception '% not found', p_entity_type;
  end if;

  if not public.has_permission(v_workspace_id, case p_entity_type when 'client' then 'clients.edit' else 'engagements.manage' end) then
    raise exception 'Not authorized';
  end if;

  select id, current_stage_id into v_run_id, v_stage_id
  from public.pipeline_runs
  where entity_type = p_entity_type and entity_id = p_entity_id and status = 'Active' and process_id = p_process_id;

  if v_run_id is null then
    v_run_id := public.start_pipeline_run(p_entity_type, p_entity_id, p_process_id);
    select current_stage_id into v_stage_id from public.pipeline_runs where id = v_run_id;
  end if;

  select id into v_target_stage_id from public.pipeline_stages
  where pipeline_run_id = v_run_id and process_stage_id = p_process_stage_id;

  if v_target_stage_id is null then
    raise exception 'Target stage is not part of this pipeline';
  end if;

  select display_order into v_target_order from public.pipeline_stages where id = v_target_stage_id;
  select display_order into v_current_order from public.pipeline_stages where id = v_stage_id;

  if v_target_order < v_current_order then
    raise exception 'Moving backward through pipeline stages is not supported';
  end if;

  v_loop_guard := 0;
  while v_stage_id is distinct from v_target_stage_id and v_loop_guard < 100 loop
    update public.pipeline_stages set status = 'Completed', completed_at = now() where id = v_stage_id;
    select current_stage_id into v_stage_id from public.pipeline_runs where id = v_run_id;
    v_loop_guard := v_loop_guard + 1;
  end loop;
end;
$function$;

-- 3. advance_lead_pipeline_on_stage_completed + advance_workflow_on_stage_completed
-- -> one trigger function. E-file auto-skip now matches by process_stages.stage_role
-- instead of a hardcoded stage_name string.
create or replace function public.advance_pipeline_on_stage_completed()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_entity_type text;
  v_entity_id uuid;
  v_stage_role text;
  v_efile_status text;
  v_next_stage_id uuid;
begin
  select entity_type, entity_id into v_entity_type, v_entity_id
  from public.pipeline_runs where id = new.pipeline_run_id;

  if new.status = 'Completed' and v_entity_type = 'engagement' then
    select stage_role into v_stage_role from public.process_stages where id = new.process_stage_id;
    if v_stage_role = 'efile_decision' then
      select efile_status into v_efile_status from public.engagement_tax_details where engagement_id = v_entity_id;
      if v_efile_status = 'accepted' then
        update public.pipeline_stages ps
        set status = 'Skipped'
        from public.process_stages pst
        where ps.process_stage_id = pst.id
          and pst.stage_role = 'efile_rejected'
          and ps.pipeline_run_id = new.pipeline_run_id
          and ps.status not in ('Completed', 'Skipped');
      end if;
    end if;
  end if;

  select id into v_next_stage_id from public.pipeline_stages
  where pipeline_run_id = new.pipeline_run_id
    and display_order > new.display_order
    and status not in ('Completed', 'Skipped')
  order by display_order asc limit 1;

  if v_next_stage_id is not null then
    update public.pipeline_runs set current_stage_id = v_next_stage_id where id = new.pipeline_run_id;
    update public.pipeline_stages set status = 'In Progress', started_at = now() where id = v_next_stage_id;
  else
    update public.pipeline_runs set status = 'Completed', completed_at = now() where id = new.pipeline_run_id;
    if v_entity_type = 'engagement' then
      update public.engagements set status = 'Completed', completed_date = now() where id = v_entity_id;
    end if;
  end if;

  return new;
end;
$function$;

-- 4. fire_lead_pipeline_stage_entered_automations + fire_workflow_stage_entered_automations
-- -> one trigger function. Keeps firing the distinct lead.stage_entered vs
-- engagement.stage_entered automation trigger types -- only the backing
-- table changed, not the automation vocabulary.
create or replace function public.fire_pipeline_stage_entered_automations()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_automation record;
  v_context jsonb;
  v_run_id uuid;
  v_entity_type text;
  v_entity_id uuid;
  v_workspace_id uuid;
  v_client_id uuid;
begin
  if new.status <> 'In Progress' or old.status is not distinct from 'In Progress' then
    return new;
  end if;

  select pr.entity_type, pr.entity_id, pr.workspace_id into v_entity_type, v_entity_id, v_workspace_id
  from public.pipeline_runs pr where pr.id = new.pipeline_run_id;

  if v_entity_id is null then
    return new;
  end if;

  v_context := jsonb_build_object('process_stage_id', new.process_stage_id);

  if v_entity_type = 'client' then
    v_client_id := v_entity_id;
    for v_automation in
      select * from public.automations
      where workspace_id = v_workspace_id and is_enabled = true and status = 'published'
        and trigger_type = 'lead.stage_entered'
        and trigger_config ->> 'process_stage_id' = new.process_stage_id::text
    loop
      if public.evaluate_automation_conditions(v_automation.conditions, v_context, v_workspace_id, v_client_id, null) then
        insert into public.automation_runs (workspace_id, automation_id, client_id, trigger_snapshot, status)
        values (v_workspace_id, v_automation.id, v_client_id, v_context, 'running')
        returning id into v_run_id;
        perform public.start_next_automation_step(v_run_id);
      end if;
    end loop;
  else
    select client_id into v_client_id from public.engagements where id = v_entity_id;
    for v_automation in
      select * from public.automations
      where workspace_id = v_workspace_id and is_enabled = true and status = 'published'
        and trigger_type = 'engagement.stage_entered'
        and trigger_config ->> 'process_stage_id' = new.process_stage_id::text
    loop
      if public.evaluate_automation_conditions(v_automation.conditions, v_context, v_workspace_id, v_client_id, v_entity_id) then
        insert into public.automation_runs (workspace_id, automation_id, engagement_id, client_id, trigger_snapshot, status)
        values (v_workspace_id, v_automation.id, v_entity_id, v_client_id, v_context, 'running')
        returning id into v_run_id;
        perform public.start_next_automation_step(v_run_id);
      end if;
    end loop;
  end if;

  return new;
end;
$function$;

-- 5. apply_workflow_stage_default_assignment -> gated to entity_type =
-- 'engagement' to preserve today's exact behavior (lead stages never got
-- default-assigned before, since lead_pipeline_stages had no such trigger).
create or replace function public.apply_pipeline_stage_default_assignment()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_owner_id uuid;
begin
  if new.entity_type <> 'engagement' then
    return new;
  end if;

  if new.assigned_staff_id is null or new.reviewer_id is null then
    select wu.user_id into v_owner_id
    from public.workspace_users wu
    where wu.workspace_id = new.workspace_id and wu.is_owner and wu.status = 'active'
    limit 1;

    new.assigned_staff_id := coalesce(new.assigned_staff_id, v_owner_id);
    new.reviewer_id := coalesce(new.reviewer_id, v_owner_id);
  end if;
  return new;
end;
$function$;

-- 6. audit_workflow_event -> gated to entity_type = 'engagement', same
-- reasoning (leads never got audit-logged before).
create or replace function public.audit_pipeline_event()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if new.entity_type <> 'engagement' then
    return new;
  end if;

  insert into public.activity_log (workspace_id, entity_type, entity_id, activity_type, event_type, description, metadata)
  values (
    new.workspace_id,
    'workflow_run',
    new.id,
    'STATUS_CHANGE',
    'STATUS_CHANGE',
    'Workflow status changed from ' || coalesce(old.status::text, 'NULL') || ' to ' || new.status::text,
    jsonb_build_object('old_status', old.status, 'new_status', new.status)
  );
  return new;
end;
$function$;

-- 7. sync_engagement_current_stage -> reads from pipeline_stages, gated to
-- entity_type = 'engagement' (clients have no equivalent protected column).
create or replace function public.sync_engagement_current_stage()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_stage_name text;
begin
  if new.entity_type <> 'engagement' or new.current_stage_id is null then
    return new;
  end if;

  select stage_name into v_stage_name from public.pipeline_stages where id = new.current_stage_id;
  if v_stage_name is not null then
    update public.engagements set current_stage = v_stage_name where id = new.entity_id;
  end if;
  return new;
end;
$function$;

-- 8. Triggers on the new tables.
create trigger set_updated_at before update on public.pipeline_runs for each row execute function set_updated_at();
create trigger set_updated_at before update on public.pipeline_stages for each row execute function set_updated_at();

create trigger trg_advance_pipeline_on_stage_completed
  after update on public.pipeline_stages
  for each row
  when (new.status = any (array['Completed'::workflow_stage_status, 'Skipped'::workflow_stage_status]) and old.status is distinct from new.status)
  execute function advance_pipeline_on_stage_completed();

create trigger trg_apply_pipeline_stage_default_assignment
  before insert on public.pipeline_stages
  for each row execute function apply_pipeline_stage_default_assignment();

create trigger trg_fire_pipeline_stage_entered_automations
  after update of status on public.pipeline_stages
  for each row execute function fire_pipeline_stage_entered_automations();

create trigger trg_audit_pipeline_status
  after update of status on public.pipeline_runs
  for each row execute function audit_pipeline_event();

create trigger trg_sync_engagement_current_stage
  after update on public.pipeline_runs
  for each row
  when (new.current_stage_id is distinct from old.current_stage_id)
  execute function sync_engagement_current_stage();

-- 9. check_stage_readiness was dead code (never called from the frontend)
-- referencing workflow_stages directly -- dropped rather than carried
-- forward unused.
drop function if exists public.check_stage_readiness(uuid);

-- 10. create_engagement RPC -- both entry points (this RPC and the
-- create_engagement automation action below) now hand off an existing
-- active same-pipeline run instead of always starting a brand-new one, so
-- one pipeline can carry a case from lead through delivery without a
-- second run ever being created.
create or replace function public.create_engagement(p_workspace_id uuid, p_client_id uuid, p_service_id uuid DEFAULT NULL::uuid, p_assigned_staff_id uuid DEFAULT NULL::uuid, p_priority engagement_priority DEFAULT 'Medium'::engagement_priority, p_billing_rule_id uuid DEFAULT NULL::uuid, p_process_id uuid DEFAULT NULL::uuid, p_case_type text DEFAULT 'other'::text, p_due_date timestamp with time zone DEFAULT NULL::timestamp with time zone)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_service record;
  v_process record;
  v_engagement_id uuid;
  v_billing_rule_id uuid;
  v_process_id uuid;
  v_handoff_run_id uuid;
begin
  if not has_permission(p_workspace_id, 'engagements.manage') then
    raise exception 'insufficient permissions to create an engagement in this workspace';
  end if;

  if p_service_id is not null then
    select id, process_id, billing_rule_id into v_service from services
    where id = p_service_id and (workspace_id is null or workspace_id = p_workspace_id);
    if v_service.id is null then raise exception 'service % not found or not accessible in this workspace', p_service_id; end if;
    v_billing_rule_id := coalesce(p_billing_rule_id, v_service.billing_rule_id);
  else
    v_billing_rule_id := p_billing_rule_id;
  end if;

  if p_process_id is not null then
    select id into v_process from processes where id = p_process_id and (workspace_id is null or workspace_id = p_workspace_id);
    if v_process.id is null then raise exception 'pipeline % not found or not accessible in this workspace', p_process_id; end if;
    v_process_id := p_process_id;
  elsif p_service_id is not null then
    v_process_id := v_service.process_id;
  else
    v_process_id := null;
  end if;

  insert into engagements (workspace_id, client_id, service_id, workflow_id, assigned_staff_id, priority, billing_rule_id, case_type, due_date)
  values (p_workspace_id, p_client_id, p_service_id, v_process_id, p_assigned_staff_id, p_priority, v_billing_rule_id, coalesce(p_case_type, 'other'), p_due_date)
  returning id into v_engagement_id;

  if v_process_id is not null then
    update pipeline_runs
    set entity_type = 'engagement', entity_id = v_engagement_id
    where entity_type = 'client' and entity_id = p_client_id
      and process_id = v_process_id and status = 'Active'
    returning id into v_handoff_run_id;

    if v_handoff_run_id is not null then
      update pipeline_stages set entity_type = 'engagement' where pipeline_run_id = v_handoff_run_id;
    else
      perform start_pipeline_run('engagement', v_engagement_id, v_process_id);
    end if;
  end if;

  return v_engagement_id;
end;
$function$;

-- 11. _evaluate_condition_list -- the two subqueries resolving
-- lead.process_stage_id and engagement.process_id/process_stage_id now
-- read the unified table; field names shown to automation staff are
-- unchanged. Picks the most-recently-started active run since a client or
-- engagement can now have more than one concurrent active pipeline.
create or replace function public._evaluate_condition_list(p_conditions jsonb, p_context jsonb, p_workspace_id uuid, p_client_id uuid, p_engagement_id uuid)
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
  select pr.process_id, ps.process_stage_id into v_process_id, v_process_stage_id
  from public.pipeline_runs pr
  join public.pipeline_stages ps on ps.id = pr.current_stage_id
  where pr.entity_type = 'engagement' and pr.entity_id = p_engagement_id and pr.status = 'Active'
  order by pr.started_at desc limit 1;
  select ps.process_stage_id into v_lead_process_stage_id
  from public.pipeline_runs pr
  join public.pipeline_stages ps on ps.id = pr.current_stage_id
  where pr.entity_type = 'client' and pr.entity_id = p_client_id and pr.status = 'Active'
  order by pr.started_at desc limit 1;
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
      v_org_template_id_raw := split_part(coalesce(v_expected, ''), '|', 1);
      v_org_expected_status := split_part(coalesce(v_expected, ''), '|', 2);
      v_org_template_id := case
        when v_org_template_id_raw = 'current_run' then nullif(p_context->>'last_organizer_template_id', '')::uuid
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

-- 12. enqueue_reminder_notifications -- only the workflow-stage-due block
-- changes, reading the unified table filtered to entity_type='engagement'
-- (leads never had due dates on stages, unchanged).
create or replace function public.enqueue_reminder_notifications()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_count int := 0;
  r record;
begin
  for r in
    select i.id, i.workspace_id, i.due_date, i.total_amount, i.amount_paid, i.invoice_number, i.client_id,
           cpu.user_id, u.email, c.primary_phone
    from public.invoices i
    join public.client_portal_users cpu on cpu.client_id = i.client_id and cpu.is_primary = true and cpu.status = 'active'
    join auth.users u on u.id = cpu.user_id
    join public.clients c on c.id = i.client_id
    where i.status not in ('paid', 'void', 'draft')
      and i.amount_paid < i.total_amount
      and i.due_date is not null
      and i.due_date between now() and now() + interval '3 days'
  loop
    if public.is_notification_enabled(r.user_id, r.workspace_id, 'invoice_due', 'Email') then
      insert into public.notification_queue (workspace_id, channel, template_key, event_type, payload, recipient_user_id, recipient_email, dedupe_key, entity_type, entity_id)
      values (r.workspace_id, 'Email', 'invoice-due-reminder', 'invoice_due',
              jsonb_build_object('invoice_number', r.invoice_number, 'due_date', r.due_date, 'amount_due', r.total_amount - r.amount_paid),
              r.user_id, r.email, 'invoice_due:' || r.id, 'client', r.client_id)
      on conflict (workspace_id, template_key, dedupe_key) where dedupe_key is not null do nothing;
      if found then v_count := v_count + 1; end if;
    end if;
    if r.primary_phone is not null and public.is_notification_enabled(r.user_id, r.workspace_id, 'invoice_due', 'SMS') then
      insert into public.notification_queue (workspace_id, channel, template_key, event_type, payload, recipient_user_id, recipient_phone, dedupe_key, entity_type, entity_id)
      values (r.workspace_id, 'SMS', 'invoice-due-reminder-sms', 'invoice_due',
              jsonb_build_object('invoice_number', r.invoice_number, 'due_date', r.due_date, 'amount_due', r.total_amount - r.amount_paid),
              r.user_id, r.primary_phone, 'invoice_due:' || r.id, 'client', r.client_id)
      on conflict (workspace_id, template_key, dedupe_key) where dedupe_key is not null do nothing;
      if found then v_count := v_count + 1; end if;
    end if;
  end loop;

  for r in
    select s.id as signer_id, sr.workspace_id, sr.due_date, sr.title, s.signer_name, s.signer_email
    from public.signature_request_signers s
    join public.signature_requests sr on sr.id = s.signature_request_id
    where s.status = 'pending'
      and sr.status = 'pending'
      and sr.due_date is not null
      and sr.due_date between now() and now() + interval '2 days'
      and s.signer_email is not null
  loop
    insert into public.notification_queue (workspace_id, channel, template_key, event_type, payload, recipient_email, dedupe_key)
    values (r.workspace_id, 'Email', 'signature-due-reminder', 'signature_due',
            jsonb_build_object('signer_name', r.signer_name, 'document_title', r.title, 'due_date', r.due_date),
            r.signer_email, 'signature_due:' || r.signer_id)
    on conflict (workspace_id, template_key, dedupe_key) where dedupe_key is not null do nothing;
    if found then v_count := v_count + 1; end if;
  end loop;

  for r in
    select ps.id as stage_id, pr.workspace_id, pr.entity_id as engagement_id, ps.due_date, ps.stage_name, ps.reviewer_id, u.email, up.phone
    from public.pipeline_stages ps
    join public.pipeline_runs pr on pr.id = ps.pipeline_run_id
    join auth.users u on u.id = ps.reviewer_id
    left join public.user_profiles up on up.id = ps.reviewer_id
    where pr.entity_type = 'engagement'
      and ps.status in ('Pending', 'In Progress', 'Waiting')
      and ps.due_date is not null
      and ps.due_date between now() and now() + interval '2 days'
      and ps.reviewer_id is not null
  loop
    if public.is_notification_enabled(r.reviewer_id, r.workspace_id, 'workflow_stage_due', 'Email') then
      insert into public.notification_queue (workspace_id, channel, template_key, event_type, payload, recipient_user_id, recipient_email, dedupe_key, entity_type, entity_id)
      values (r.workspace_id, 'Email', 'workflow-stage-due-reminder', 'workflow_stage_due',
              jsonb_build_object('stage_name', r.stage_name, 'due_date', r.due_date),
              r.reviewer_id, r.email, 'workflow_stage_due:' || r.stage_id, 'engagement', r.engagement_id)
      on conflict (workspace_id, template_key, dedupe_key) where dedupe_key is not null do nothing;
      if found then v_count := v_count + 1; end if;
    end if;
    if r.phone is not null and public.is_notification_enabled(r.reviewer_id, r.workspace_id, 'workflow_stage_due', 'SMS') then
      insert into public.notification_queue (workspace_id, channel, template_key, event_type, payload, recipient_user_id, recipient_phone, dedupe_key, entity_type, entity_id)
      values (r.workspace_id, 'SMS', 'workflow-stage-due-reminder-sms', 'workflow_stage_due',
              jsonb_build_object('stage_name', r.stage_name, 'due_date', r.due_date),
              r.reviewer_id, r.phone, 'workflow_stage_due:' || r.stage_id, 'engagement', r.engagement_id)
      on conflict (workspace_id, template_key, dedupe_key) where dedupe_key is not null do nothing;
      if found then v_count := v_count + 1; end if;
    end if;
  end loop;

  for r in
    select a.id, a.workspace_id, a.title, a.start_at, a.location, a.staff_id, u.email, up.phone
    from public.appointments a
    join auth.users u on u.id = a.staff_id
    left join public.user_profiles up on up.id = a.staff_id
    where a.status in ('scheduled', 'confirmed')
      and a.start_at between now() and now() + interval '1 day'
      and a.staff_id is not null
  loop
    if public.is_notification_enabled(r.staff_id, r.workspace_id, 'appointment_reminder', 'Email') then
      insert into public.notification_queue (workspace_id, channel, template_key, event_type, payload, recipient_user_id, recipient_email, dedupe_key)
      values (r.workspace_id, 'Email', 'appointment-reminder', 'appointment_reminder',
              jsonb_build_object('title', r.title, 'start_at', r.start_at, 'location', coalesce(r.location, 'Not specified')),
              r.staff_id, r.email, 'appointment_staff:' || r.id)
      on conflict (workspace_id, template_key, dedupe_key) where dedupe_key is not null do nothing;
      if found then v_count := v_count + 1; end if;
    end if;
    if r.phone is not null and public.is_notification_enabled(r.staff_id, r.workspace_id, 'appointment_reminder', 'SMS') then
      insert into public.notification_queue (workspace_id, channel, template_key, event_type, payload, recipient_user_id, recipient_phone, dedupe_key)
      values (r.workspace_id, 'SMS', 'appointment-reminder-sms', 'appointment_reminder',
              jsonb_build_object('title', r.title, 'start_at', r.start_at, 'location', coalesce(r.location, 'Not specified')),
              r.staff_id, r.phone, 'appointment_staff:' || r.id)
      on conflict (workspace_id, template_key, dedupe_key) where dedupe_key is not null do nothing;
      if found then v_count := v_count + 1; end if;
    end if;
  end loop;

  for r in
    select a.id, a.workspace_id, a.title, a.start_at, a.location, a.client_id, cpu.user_id, u.email, c.primary_phone
    from public.appointments a
    join public.client_portal_users cpu on cpu.client_id = a.client_id and cpu.is_primary = true and cpu.status = 'active'
    join auth.users u on u.id = cpu.user_id
    join public.clients c on c.id = a.client_id
    where a.status in ('scheduled', 'confirmed')
      and a.portal_visible = true
      and a.client_id is not null
      and a.start_at between now() and now() + interval '1 day'
  loop
    if public.is_notification_enabled(r.user_id, r.workspace_id, 'appointment_reminder', 'Email') then
      insert into public.notification_queue (workspace_id, channel, template_key, event_type, payload, recipient_user_id, recipient_email, dedupe_key)
      values (r.workspace_id, 'Email', 'appointment-reminder', 'appointment_reminder',
              jsonb_build_object('title', r.title, 'start_at', r.start_at, 'location', coalesce(r.location, 'Not specified')),
              r.user_id, r.email, 'appointment_client:' || r.id)
      on conflict (workspace_id, template_key, dedupe_key) where dedupe_key is not null do nothing;
      if found then v_count := v_count + 1; end if;
    end if;
    if r.primary_phone is not null and public.is_notification_enabled(r.user_id, r.workspace_id, 'appointment_reminder', 'SMS') then
      insert into public.notification_queue (workspace_id, channel, template_key, event_type, payload, recipient_user_id, recipient_phone, dedupe_key)
      values (r.workspace_id, 'SMS', 'appointment-reminder-sms', 'appointment_reminder',
              jsonb_build_object('title', r.title, 'start_at', r.start_at, 'location', coalesce(r.location, 'Not specified')),
              r.user_id, r.primary_phone, 'appointment_client:' || r.id)
      on conflict (workspace_id, template_key, dedupe_key) where dedupe_key is not null do nothing;
      if found then v_count := v_count + 1; end if;
    end if;
  end loop;

  for r in
    select i.id, i.workspace_id, i.invoice_number, i.expected_deposit_date, i.payment_method,
           i.total_amount - i.amount_paid as amount_due,
           coalesce(e.assigned_staff_id, admin.user_id) as recipient_user_id,
           u.email, up.phone
    from public.invoices i
    left join public.engagements e on e.id = i.engagement_id
    left join lateral (
      select wu.user_id
      from public.workspace_users wu
      join public.roles ro on ro.id = wu.role_id
      where wu.workspace_id = i.workspace_id
        and wu.status = 'active'
        and (wu.is_owner or ro.slug in ('owner', 'admin'))
      order by wu.is_owner desc, wu.created_at asc
      limit 1
    ) admin on true
    join auth.users u on u.id = coalesce(e.assigned_staff_id, admin.user_id)
    left join public.user_profiles up on up.id = coalesce(e.assigned_staff_id, admin.user_id)
    where i.status not in ('paid', 'void', 'draft')
      and i.expected_deposit_date is not null
      and i.expected_deposit_date <= current_date
  loop
    if public.is_notification_enabled(r.recipient_user_id, r.workspace_id, 'funds_received_reminder', 'Email') then
      insert into public.notification_queue (workspace_id, channel, template_key, event_type, payload, recipient_user_id, recipient_email, dedupe_key)
      values (r.workspace_id, 'Email', 'funds-received-reminder', 'funds_received_reminder',
              jsonb_build_object('invoice_number', r.invoice_number, 'expected_deposit_date', r.expected_deposit_date, 'payment_method', coalesce(r.payment_method, 'N/A'), 'amount_due', r.amount_due),
              r.recipient_user_id, r.email, 'funds_received_reminder:' || r.id)
      on conflict (workspace_id, template_key, dedupe_key) where dedupe_key is not null do nothing;
      if found then v_count := v_count + 1; end if;
    end if;
    if r.phone is not null and public.is_notification_enabled(r.recipient_user_id, r.workspace_id, 'funds_received_reminder', 'SMS') then
      insert into public.notification_queue (workspace_id, channel, template_key, event_type, payload, recipient_user_id, recipient_phone, dedupe_key)
      values (r.workspace_id, 'SMS', 'funds-received-reminder-sms', 'funds_received_reminder',
              jsonb_build_object('invoice_number', r.invoice_number, 'expected_deposit_date', r.expected_deposit_date, 'payment_method', coalesce(r.payment_method, 'N/A'), 'amount_due', r.amount_due),
              r.recipient_user_id, r.phone, 'funds_received_reminder:' || r.id)
      on conflict (workspace_id, template_key, dedupe_key) where dedupe_key is not null do nothing;
      if found then v_count := v_count + 1; end if;
    end if;
  end loop;

  for r in
    select ws.id, ws.workspace_id, ws.current_period_end,
           admin.user_id as recipient_user_id, u.email, up.phone
    from public.workspace_subscriptions ws
    left join lateral (
      select wu.user_id
      from public.workspace_users wu
      join public.roles ro on ro.id = wu.role_id
      where wu.workspace_id = ws.workspace_id
        and wu.status = 'active'
        and (wu.is_owner or ro.slug in ('owner', 'admin'))
      order by wu.is_owner desc, wu.created_at asc
      limit 1
    ) admin on true
    join auth.users u on u.id = admin.user_id
    left join public.user_profiles up on up.id = admin.user_id
    where ws.stripe_status in ('trialing', 'active', 'past_due')
      and ws.current_period_end is not null
      and ws.current_period_end - interval '7 days' between now() and now() + interval '1 day'
  loop
    if public.is_notification_enabled(r.recipient_user_id, r.workspace_id, 'subscription_renewal_reminder', 'Email') then
      insert into public.notification_queue (workspace_id, channel, template_key, event_type, payload, recipient_user_id, recipient_email, dedupe_key)
      values (r.workspace_id, 'Email', 'subscription-renewal-reminder', 'subscription_renewal_reminder',
              jsonb_build_object('renewal_date', r.current_period_end),
              r.recipient_user_id, r.email, 'subscription_renewal_reminder:' || r.id || ':' || r.current_period_end::text)
      on conflict (workspace_id, template_key, dedupe_key) where dedupe_key is not null do nothing;
      if found then v_count := v_count + 1; end if;
    end if;
    if r.phone is not null and public.is_notification_enabled(r.recipient_user_id, r.workspace_id, 'subscription_renewal_reminder', 'SMS') then
      insert into public.notification_queue (workspace_id, channel, template_key, event_type, payload, recipient_user_id, recipient_phone, dedupe_key)
      values (r.workspace_id, 'SMS', 'subscription-renewal-reminder-sms', 'subscription_renewal_reminder',
              jsonb_build_object('renewal_date', r.current_period_end),
              r.recipient_user_id, r.phone, 'subscription_renewal_reminder:' || r.id || ':' || r.current_period_end::text)
      on conflict (workspace_id, template_key, dedupe_key) where dedupe_key is not null do nothing;
      if found then v_count := v_count + 1; end if;
    end if;
  end loop;

  for r in
    select dr.id, dr.workspace_id, dr.title, dr.due_date, cpu.user_id, u.email, c.primary_phone
    from public.document_requests dr
    left join public.engagements e on dr.entity_type = 'engagement' and e.id = dr.entity_id
    join public.client_portal_users cpu
      on cpu.client_id = case when dr.entity_type = 'client' then dr.entity_id else e.client_id end
      and cpu.is_primary = true and cpu.status = 'active'
    join auth.users u on u.id = cpu.user_id
    join public.clients c on c.id = cpu.client_id
    where dr.status = 'open'
      and dr.due_date is not null
      and dr.due_date between now() and now() + interval '2 days'
  loop
    if public.is_notification_enabled(r.user_id, r.workspace_id, 'document_request_due', 'Email') then
      insert into public.notification_queue (workspace_id, channel, template_key, event_type, payload, recipient_user_id, recipient_email, dedupe_key, entity_type, entity_id)
      values (r.workspace_id, 'Email', 'document-request-due-reminder', 'document_request_due',
              jsonb_build_object('title', r.title, 'due_date', r.due_date),
              r.user_id, r.email, 'document_request_due:' || r.id, 'document_request', r.id)
      on conflict (workspace_id, template_key, dedupe_key) where dedupe_key is not null do nothing;
      if found then v_count := v_count + 1; end if;
    end if;
    if r.primary_phone is not null and public.is_notification_enabled(r.user_id, r.workspace_id, 'document_request_due', 'SMS') then
      insert into public.notification_queue (workspace_id, channel, template_key, event_type, payload, recipient_user_id, recipient_phone, dedupe_key, entity_type, entity_id)
      values (r.workspace_id, 'SMS', 'document-request-due-reminder-sms', 'document_request_due',
              jsonb_build_object('title', r.title, 'due_date', r.due_date),
              r.user_id, r.primary_phone, 'document_request_due:' || r.id, 'document_request', r.id)
      on conflict (workspace_id, template_key, dedupe_key) where dedupe_key is not null do nothing;
      if found then v_count := v_count + 1; end if;
    end if;
  end loop;

  return v_count;
end;
$function$;

-- 13. Views -- rewritten against the unified tables. v_engagement_progress
-- now uses a LATERAL join (prefers the Active run, falls back to the most
-- recently started one) instead of an unfiltered join that could fan out
-- if more than one workflow_runs row ever existed for an engagement (a
-- real gap found on the old table -- it had no unique-active-run guard at
-- all). v_workflow_sla_status now joins by process_stage_id instead of
-- stage name. Both keep their original output column names so the two
-- frontend queries (select("*") filtered by engagement_id / workflow_run_id)
-- need no changes.
create or replace view public.v_engagement_progress as
with task_counts as (
  select t.engagement_id, count(*) as total_tasks, count(*) filter (where t.status = 'completed') as completed_tasks
  from public.tasks t
  group by t.engagement_id
), doc_counts as (
  select attachments.entity_id as engagement_id,
    count(*) as total_docs,
    count(*) filter (where (attachments.category = 'Final' or attachments.tags @> array['Verified'])) as verified_docs
  from public.attachments
  where attachments.entity_type = 'engagement'
  group by attachments.entity_id
)
select
  e.id as engagement_id,
  e.engagement_number,
  pr.status as workflow_status,
  coalesce((tc.completed_tasks::float / nullif(tc.total_tasks, 0)::float) * 100, 0) as task_progress_pct,
  coalesce((dc.verified_docs::float / nullif(dc.total_docs, 0)::float) * 100, 0) as document_progress_pct,
  case
    when pr.status = 'Completed' then 100::float
    else ((coalesce(tc.completed_tasks::float / nullif(tc.total_tasks, 0)::float, 0) * 0.7)
        + (coalesce(dc.verified_docs::float / nullif(dc.total_docs, 0)::float, 0) * 0.3)) * 100
  end as overall_progress_pct
from public.engagements e
left join lateral (
  select pr2.status
  from public.pipeline_runs pr2
  where pr2.entity_type = 'engagement' and pr2.entity_id = e.id
  order by (pr2.status = 'Active') desc, pr2.started_at desc
  limit 1
) pr on true
left join task_counts tc on tc.engagement_id = e.id
left join doc_counts dc on dc.engagement_id = e.id;

create or replace view public.v_workflow_sla_status as
select
  ps.id as workflow_stage_id,
  ps.pipeline_run_id as workflow_run_id,
  ps.stage_name,
  ps.status,
  ps.due_date,
  ps.started_at,
  case when ps.completed_at is not null then ps.completed_at - ps.started_at else now() - ps.started_at end as time_elapsed,
  pst.expected_duration,
  case
    when ps.status = 'Completed' then 'Completed'
    when ps.due_date is not null and now() > ps.due_date then 'Overdue'
    when pst.expected_duration is not null and (now() - ps.started_at) > pst.expected_duration then 'Exceeded'
    else 'On Track'
  end as sla_category
from public.pipeline_stages ps
join public.process_stages pst on ps.process_stage_id = pst.id
join public.pipeline_runs pr on pr.id = ps.pipeline_run_id
where pr.entity_type = 'engagement';
