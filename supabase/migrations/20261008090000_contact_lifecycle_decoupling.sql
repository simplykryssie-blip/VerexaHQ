-- Remove Contact lifecycle status and decouple lead behavior from Contact identity.
-- Contacts remain permanently identified by clients.id. Classification uses tags;
-- process state uses pipeline/process stages; archive/lost are operational timestamps.

begin;

alter table public.clients
  add column if not exists archived_at timestamptz,
  add column if not exists archived_reason text;

update public.clients
set archived_at = coalesce(archived_at, updated_at)
where lifecycle_status = 'archived';

-- Preserve the existing lead population as a real Contact classification.
insert into public.workspace_tags (workspace_id, name)
select distinct c.workspace_id, 'Lead'
from public.clients c
where c.lifecycle_status = 'lead'
on conflict (workspace_id, name) do nothing;

update public.clients
set tags = array(
  select distinct unnest(coalesce(tags, '{}'::text[]) || array['Lead']::text[])
)
where lifecycle_status = 'lead'
  and not ('Lead' = any(coalesce(tags, '{}'::text[])));

-- Remove the obsolete Lead trigger vocabulary from saved automations.
-- Creation is represented by the Lead tag; pipeline stage entry is generic.
update public.automations
set trigger_type = 'client.tag_added',
    trigger_config = jsonb_build_object('tag', 'Lead')
where trigger_type = 'lead.created';

update public.automations
set trigger_type = 'pipeline.stage_entered'
where trigger_type = 'lead.stage_entered';

-- These trigger types depended directly on the removed lifecycle/Lead identity
-- model and have no generic equivalent that preserves their old semantics.
delete from public.automations
where trigger_type in (
  'lead.updated',
  'lead.assigned',
  'lead.status_changed',
  'lead.converted_to_client',
  'lead.marked_lost'
);

-- The live Lead-stage automation is now a generic pipeline-stage automation.
update public.automations
set trigger_type = 'pipeline.stage_entered'
where trigger_type = 'lead.stage_entered';

-- The public tax lead automation is driven by the Lead tag, not Contact identity.
update public.automations
set trigger_type = 'client.tag_added',
    trigger_config = jsonb_build_object('tag', 'Lead')
where id = 'db3e5970-5cbd-45ab-b00a-9345d5dbb272'
  and trigger_type = 'lead.created';

-- Generic tag automation must also fire when tags are present on Contact creation.
drop trigger if exists trg_fire_client_tag_automations on public.clients;

create or replace function public.fire_client_tag_automations()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_added_tags text[];
  v_added_tag text;
  v_automation record;
  v_context jsonb;
  v_run_id uuid;
  v_engagement_id uuid;
begin
  select id into v_engagement_id
  from public.engagements
  where client_id = new.id
    and status not in ('Completed', 'Archived')
  order by created_at desc
  limit 1;

  if tg_op = 'INSERT' then
    v_added_tags := coalesce(new.tags, '{}'::text[]);
  else
    v_added_tags := array(
      select unnest(coalesce(new.tags, '{}'::text[]))
      except
      select unnest(coalesce(old.tags, '{}'::text[]))
    );
  end if;

  foreach v_added_tag in array v_added_tags loop
    v_context := jsonb_build_object(
      'tag', v_added_tag,
      'client_name', btrim(coalesce(new.first_name, '') || ' ' || coalesce(new.last_name, '') || coalesce(new.business_name, ''))
    );

    for v_automation in
      select *
      from public.automations
      where workspace_id = new.workspace_id
        and is_enabled = true
        and status = 'published'
        and trigger_type = 'client.tag_added'
        and (
          trigger_config ->> 'tag' = v_added_tag
          or trigger_config -> 'tags' ? v_added_tag
        )
    loop
      if public.evaluate_automation_conditions(
        v_automation.conditions,
        v_context,
        new.workspace_id,
        new.id,
        v_engagement_id
      ) then
        insert into public.automation_runs (
          workspace_id, automation_id, engagement_id, client_id, trigger_snapshot, status
        )
        values (
          new.workspace_id, v_automation.id, v_engagement_id, new.id, v_context, 'running'
        )
        returning id into v_run_id;

        perform public.start_next_automation_step(v_run_id);
      end if;
    end loop;
  end loop;

  return new;
end;
$function$;

create trigger trg_fire_client_tag_automations
after insert or update of tags on public.clients
for each row execute function public.fire_client_tag_automations();

-- Replace the old Lead-only pipeline trigger with a generic pipeline trigger.
create or replace function public.fire_pipeline_stage_entered_automations()
returns trigger
language plpgsql
security definer
set search_path = public
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

  select pr.entity_type, pr.entity_id, pr.workspace_id
  into v_entity_type, v_entity_id, v_workspace_id
  from public.pipeline_runs pr
  where pr.id = new.pipeline_run_id;

  if v_entity_id is null then
    return new;
  end if;

  v_context := jsonb_build_object('process_stage_id', new.process_stage_id);

  if v_entity_type = 'client' then
    v_client_id := v_entity_id;

    for v_automation in
      select *
      from public.automations
      where workspace_id = v_workspace_id
        and is_enabled = true
        and status = 'published'
        and trigger_type = 'pipeline.stage_entered'
        and trigger_config ->> 'process_stage_id' = new.process_stage_id::text
    loop
      if public.evaluate_automation_conditions(
        v_automation.conditions, v_context, v_workspace_id, v_client_id, null
      ) then
        insert into public.automation_runs (
          workspace_id, automation_id, client_id, trigger_snapshot, status
        )
        values (
          v_workspace_id, v_automation.id, v_client_id, v_context, 'running'
        )
        returning id into v_run_id;

        perform public.start_next_automation_step(v_run_id);
      end if;
    end loop;

  elsif v_entity_type = 'engagement' then
    select client_id into v_client_id
    from public.engagements
    where id = v_entity_id;

    for v_automation in
      select *
      from public.automations
      where workspace_id = v_workspace_id
        and is_enabled = true
        and status = 'published'
        and trigger_type = 'engagement.stage_entered'
        and trigger_config ->> 'process_stage_id' = new.process_stage_id::text
    loop
      if public.evaluate_automation_conditions(
        v_automation.conditions, v_context, v_workspace_id, v_client_id, v_entity_id
      ) then
        insert into public.automation_runs (
          workspace_id, automation_id, engagement_id, client_id, trigger_snapshot, status
        )
        values (
          v_workspace_id, v_automation.id, v_entity_id, v_client_id, v_context, 'running'
        )
        returning id into v_run_id;

        perform public.start_next_automation_step(v_run_id);
      end if;
    end loop;
  end if;

  return new;
end;
$function$;

-- Public contact capture keeps its API name for compatibility, but creates a
-- Contact with a Lead tag instead of a lifecycle state.
create or replace function public.find_or_create_public_lead(
  p_workspace_id uuid,
  p_first_name text,
  p_last_name text,
  p_email text,
  p_phone text
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $function$
declare
  v_normalized_email citext;
  v_normalized_phone text;
  v_client_id uuid;
begin
  if not public.is_workspace_operational(p_workspace_id) then
    raise exception 'this workspace is not currently operational';
  end if;
  if not public.can_operate_client_book(p_workspace_id) then
    raise exception 'this workspace is not enabled to operate a client/engagement book';
  end if;

  v_normalized_email := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_normalized_phone := nullif(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), '');

  select id into v_client_id
  from public.clients
  where workspace_id = p_workspace_id
    and merged_into_client_id is null
    and (
      (v_normalized_email is not null and normalized_email = v_normalized_email)
      or (v_normalized_phone is not null and normalized_phone = v_normalized_phone)
    )
  limit 1;

  if v_client_id is not null then
    update public.clients
    set tags = array(
      select distinct unnest(coalesce(tags, '{}'::text[]) || array['Lead']::text[])
    )
    where id = v_client_id;
    return v_client_id;
  end if;

  insert into public.clients (
    workspace_id, client_type, first_name, last_name, primary_email, primary_phone,
    normalized_email, normalized_phone, tags
  )
  values (
    p_workspace_id, 'individual',
    nullif(btrim(p_first_name), ''),
    nullif(btrim(p_last_name), ''),
    nullif(btrim(coalesce(p_email, '')), ''),
    nullif(btrim(coalesce(p_phone, '')), ''),
    v_normalized_email,
    v_normalized_phone,
    array['Lead']::text[]
  )
  returning id into v_client_id;

  return v_client_id;
end;
$function$;

-- Archive/lost/restore remain operational actions. They no longer mutate
-- Contact identity or a lifecycle field.
create or replace function public.archive_client(p_client_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_workspace_id uuid;
begin
  select workspace_id into v_workspace_id from public.clients where id = p_client_id;
  if v_workspace_id is null then
    raise exception 'Client not found';
  end if;
  if not public.has_permission(v_workspace_id, 'clients.edit') then
    raise exception 'insufficient permissions';
  end if;
  if not public.is_workspace_operational(v_workspace_id) then
    raise exception 'this workspace is not currently operational';
  end if;

  update public.clients
  set archived_at = now(),
      archived_reason = coalesce(archived_reason, 'Archived by staff'),
      tags = array_remove(
        array(select distinct unnest(coalesce(tags, '{}'::text[]) || array['Archived']::text[])),
        'Lead'
      )
  where id = p_client_id;

  update public.engagements
  set status = 'Archived', archived_date = now()
  where client_id = p_client_id
    and status not in ('Completed', 'Archived');

  update public.document_requests
  set status = 'cancelled'
  where status = 'open'
    and (
      (entity_type = 'client' and entity_id = p_client_id)
      or (entity_type = 'engagement' and entity_id in (
        select id from public.engagements where client_id = p_client_id
      ))
    );
end;
$function$;

create or replace function public.restore_client(p_client_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_workspace_id uuid;
begin
  select workspace_id into v_workspace_id from public.clients where id = p_client_id;
  if v_workspace_id is null then
    raise exception 'Client not found';
  end if;
  if not public.has_permission(v_workspace_id, 'clients.edit') then
    raise exception 'insufficient permissions';
  end if;
  if not public.is_workspace_operational(v_workspace_id) then
    raise exception 'this workspace is not currently operational';
  end if;

  update public.clients
  set archived_at = null,
      archived_reason = null,
      tags = array_remove(coalesce(tags, '{}'::text[]), 'Archived')
  where id = p_client_id;
end;
$function$;

create or replace function public.mark_client_lost(
  p_client_id uuid,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_workspace_id uuid;
begin
  select workspace_id into v_workspace_id from public.clients where id = p_client_id;
  if v_workspace_id is null then
    raise exception 'Client not found';
  end if;
  if not public.has_permission(v_workspace_id, 'clients.edit') then
    raise exception 'insufficient permissions';
  end if;
  if not public.is_workspace_operational(v_workspace_id) then
    raise exception 'this workspace is not currently operational';
  end if;

  update public.clients
  set lost_reason = p_reason,
      lost_at = now(),
      tags = array_remove(
        array(select distinct unnest(coalesce(tags, '{}'::text[]) || array['Lost']::text[])),
        'Lead'
      )
  where id = p_client_id;

  update public.engagements
  set status = 'Archived', archived_date = now()
  where client_id = p_client_id
    and status not in ('Completed', 'Archived');

  update public.invoices
  set status = 'void'
  where client_id = p_client_id
    and status not in ('paid', 'void');

  update public.document_requests
  set status = 'cancelled'
  where status = 'open'
    and (
      (entity_type = 'client' and entity_id = p_client_id)
      or (entity_type = 'engagement' and entity_id in (
        select id from public.engagements where client_id = p_client_id
      ))
    );
end;
$function$;

-- Remove the old Lead-specific trigger functions before the Contact column is dropped.
drop trigger if exists trg_validate_client_lifecycle_status on public.clients;
drop function if exists public.validate_client_lifecycle_status();
drop trigger if exists trg_fire_lead_assigned_automations on public.clients;
drop trigger if exists trg_fire_lead_created_automations on public.clients;
drop trigger if exists trg_fire_lead_status_changed_automations on public.clients;
drop trigger if exists trg_fire_lead_updated_automations on public.clients;
drop trigger if exists trg_flip_lead_on_quote_acceptance on public.quotes;

drop function if exists public.fire_lead_assigned_automations();
drop function if exists public.fire_lead_created_automations();
drop function if exists public.fire_lead_status_changed_automations();
drop function if exists public.fire_lead_updated_automations();
drop function if exists public.flip_lead_on_quote_acceptance();
drop function if exists public.auto_start_lead_pipeline_on_create();
drop function if exists public.protect_entry_lead_stage();

-- Remove lifecycle dependencies from generic functions that copied/filtered Contacts.
do $function$
declare
  v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'copy_shared_engagement'
  limit 1;

  if v_def is not null then
    v_def := replace(v_def, ', lifecycle_status, first_name', ', first_name');
    v_def := replace(v_def, 'id, workspace_id, client_type, lifecycle_status, first_name', 'id, workspace_id, client_type, first_name');
    execute v_def;
  end if;
end;
$function$;

do $function$
declare
  v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'fire_date_reminder_automations'
  limit 1;

  if v_def is not null then
    v_def := replace(
      v_def,
      'and lifecycle_status not in (''archived'', ''lost'')',
      'and not exists (select 1 from public.clients c where c.id = r.client_id and (c.archived_at is not null or c.lost_at is not null))'
    );
    execute v_def;
  end if;
end;
$function$;

do $function$
declare
  v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'merge_clients'
  limit 1;

  if v_def is not null then
    v_def := replace(
      v_def,
      'set merged_into_client_id = p_primary_client_id, lifecycle_status = ''archived''',
      $$set merged_into_client_id = p_primary_client_id,
          archived_at = now(),
          archived_reason = 'Merged into another contact',
          tags = array_remove(array(select distinct unnest(coalesce(tags, '{}'::text[]) || array['Archived']::text[])), 'Lead')$$
    );
    execute v_def;
  end if;
end;
$function$;

do $function$
declare
  v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'resolve_client_relationship_manager'
  limit 1;

  if v_def is not null then
    v_def := replace(
      v_def,
      'c2.lifecycle_status not in (''archived'', ''lost'')',
      'c2.archived_at is null and c2.lost_at is null'
    );
    execute v_def;
  end if;
end;
$function$;

-- Genericize the condition evaluator: pipeline stage is a process/pipeline
-- concept, not a Lead concept, and lifecycle status is no longer a condition field.
do $function$
declare
  v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = '_evaluate_condition_list'
  limit 1;

  v_def := replace(v_def, 'v_lead_process_stage_id', 'v_client_process_stage_id');
  v_def := replace(v_def, 'when ''lead.process_stage_id'' then v_client_process_stage_id::text', 'when ''pipeline.process_stage_id'' then v_client_process_stage_id::text');
  v_def := replace(v_def, '        when ''client.lifecycle_status'' then v_client.lifecycle_status' || chr(10), '');
  if v_def is null or position('lifecycle_status' in v_def) > 0 or position('lead.process_stage_id' in v_def) > 0 then
    raise exception 'Condition evaluator still contains removed Contact lifecycle dependencies';
  end if;
  execute v_def;
end;
$function$;

-- Genericize the automation executor. No automation action may depend on
-- Contact lifecycle status or the obsolete Lead-funnel process flag.
do $executor$
declare
  v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'execute_automation_step'
  limit 1;

  -- Relationship-manager balancing ignores operationally closed contacts.
  v_def := replace(
    v_def,
    $$where c2.relationship_manager_id = wu.user_id and c2.lifecycle_status not in ('archived', 'lost')$$,
    $$where c2.relationship_manager_id = wu.user_id and c2.archived_at is null and c2.lost_at is null$$
  );

  -- The obsolete process flag no longer exists; never use it as a gate.
  v_def := replace(v_def, 'is_lead_funnel', 'false');

  -- Genericize the service-pipeline action name.
  v_def := replace(v_def, 'move_lead_to_service_pipeline', 'move_to_service_pipeline');
  v_def := replace(v_def, 'mark_lead_lost', 'mark_contact_lost');

  -- Lost is an operational disposition, not Contact identity.
  v_def := replace(
    v_def,
    $$update public.clients set lifecycle_status = 'lost', lost_reason = v_step.action_config->>'reason', lost_at = now() where id = v_run.client_id;$$,
    $$update public.clients
      set lost_reason = v_step.action_config->>'reason',
          lost_at = now(),
          tags = array_remove(
            array(select distinct unnest(coalesce(tags, '{}'::text[]) || array['Lost']::text[])),
            'Lead'
          )
      where id = v_run.client_id;$$
  );

  -- Conversion is no longer an identity transition. Keep the old branch
  -- unreachable so any stale saved automation cannot mutate a removed field.
  v_def := replace(
    v_def,
    $$elsif v_step.action_type = 'convert_lead_to_client' then$$,
    $$elsif false then$$
  );
  v_def := replace(
    v_def,
    $$update public.clients set lifecycle_status = 'active' where id = v_run.client_id;$$,
    $$null;$$
  );

  -- New Contacts are created without an implicit lifecycle state. If the
  -- action supplies a tag, preserve it; otherwise start with no tags.
  v_def := replace(
    v_def,
    $$insert into public.clients (workspace_id, client_type, first_name, last_name, primary_email, primary_phone, normalized_email, normalized_phone, lifecycle_status)$$,
    $$insert into public.clients (workspace_id, client_type, first_name, last_name, primary_email, primary_phone, normalized_email, normalized_phone, tags)$$
  );
  v_def := replace(
    v_def,
    'coalesce(nullif(v_step.action_config->>''lifecycle_status'', ''''), ''lead'')',
    'case when nullif(v_step.action_config->>''tag'', '''') is not null then array[v_step.action_config->>''tag'']::text[] else ''{}''::text[] end'
  );

  if position('lifecycle_status' in v_def) > 0
     or position('is_lead_funnel' in v_def) > 0
     or position('move_lead_to_service_pipeline' in v_def) > 0
     or position('mark_lead_lost' in v_def) > 0
     or position('convert_lead_to_client' in v_def) > 0 then
    raise exception 'Automation executor still contains removed Contact lifecycle/Lead dependencies';
  end if;

  execute v_def;
end;
$executor$;

-- The trigger vocabulary is now generic.
create or replace function public.known_automation_trigger_types()
returns text[]
language sql
immutable
as $function$
  select array[
    'engagement.status_changed', 'organizer.submitted', 'client.tag_added', 'client.portal_created',
    'client.service_interest_selected', 'engagement.created', 'appointment.status_changed', 'appointment.booked',
    'engagement_letter.signed', 'document_request.completed', 'organizer_information_request.resolved',
    'organizer_response.review_decided', 'engagement.stage_entered', 'pipeline.stage_entered',
    'quote.created', 'quote.sent', 'quote.accepted', 'quote.declined', 'document_request.sent', 'document.uploaded',
    'task.created', 'task.completed', 'client_message.received', 'task.overdue', 'webhook.received',
    'engagement.due_date_reminder', 'quote.expiring_reminder', 'client.birthday_reminder', 'email.opened',
    'email.clicked', 'email.bounced', 'sms.delivered', 'sms.failed', 'invoice.sent', 'invoice.paid',
    'invoice.overdue', 'payment_plan.installment_paid', 'engagement_share.created', 'firm_package.purchased',
    'partner_package.purchased', 'firm_package.canceled', 'partner_onboarding.created',
    'partner_onboarding.status_changed', 'task.assigned', 'task.reassigned', 'invoice.created',
    'payment.failed', 'digital_product.purchased', 'digital_product.canceled', 'service.purchased',
    'service.canceled', 'product.purchased', 'product.canceled'
  ]::text[];
$function$;

-- The process-level Lead Funnel flag is obsolete: processes are generic.
alter table public.processes drop column if exists is_lead_funnel;

-- Replace search_clients with a tag/pipeline-aware Contact search. The old
-- lifecycle-status parameter is intentionally removed from the RPC contract.
drop function if exists public.search_clients(
  uuid, text, text[], text, uuid, uuid, text, boolean, boolean, text, boolean, boolean, integer, integer
);

create or replace function public.search_clients(
  p_workspace_id uuid,
  p_query text default null,
  p_tag text default null,
  p_service_id uuid default null,
  p_assigned_staff_id uuid default null,
  p_pipeline_stage_name text default null,
  p_missing_documents boolean default null,
  p_outstanding_balance boolean default null,
  p_client_type text default null,
  p_has_email boolean default null,
  p_has_phone boolean default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table(
  id uuid,
  client_type text,
  first_name text,
  last_name text,
  business_name text,
  primary_email text,
  primary_phone text,
  tags text[],
  total_count bigint
)
language plpgsql
stable security definer
set search_path = public
as $search$
begin
  if not public.is_workspace_member(p_workspace_id) then
    raise exception 'insufficient permissions';
  end if;

  return query
  with matched as (
    select c.*
    from public.clients c
    where c.workspace_id = p_workspace_id
      and c.merged_into_client_id is null
      and (p_tag is null or p_tag = any(c.tags))
      and (p_assigned_staff_id is null or c.relationship_manager_id = p_assigned_staff_id)
      and (p_client_type is null or c.client_type = p_client_type)
      and (p_has_email is null or p_has_email = (c.primary_email is not null))
      and (p_has_phone is null or p_has_phone = (c.primary_phone is not null))
      and (
        p_query is null or btrim(p_query) = '' or
        (coalesce(c.business_name, '') || ' ' || coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')) ilike '%' || p_query || '%' or
        c.primary_email ilike '%' || p_query || '%' or
        c.primary_phone ilike '%' || p_query || '%' or
        c.ssn_last4 = p_query or
        c.ein_last4 = p_query or
        exists (
          select 1 from public.engagements e
          where e.client_id = c.id and e.engagement_number ilike '%' || p_query || '%'
        )
      )
      and (
        p_service_id is null or exists (
          select 1 from public.client_service_interests si where si.client_id = c.id and si.service_id = p_service_id
        ) or exists (
          select 1 from public.engagements e where e.client_id = c.id and e.service_id = p_service_id
        )
      )
      and (
        p_pipeline_stage_name is null or exists (
          select 1
          from public.pipeline_runs pr
          join public.pipeline_stages ps on ps.pipeline_run_id = pr.id and ps.id = pr.current_stage_id
          where pr.status = 'Active' and ps.stage_name = p_pipeline_stage_name
            and (
              (pr.entity_type = 'client' and pr.entity_id = c.id)
              or (pr.entity_type = 'engagement' and pr.entity_id in (
                select e2.id from public.engagements e2 where e2.client_id = c.id
              ))
            )
        )
      )
      and (
        p_missing_documents is null or p_missing_documents = exists (
          select 1
          from public.document_request_item_statuses dris
          join public.document_requests dr on dr.id = dris.document_request_id
          where dris.is_required = true and dris.status = 'pending'
            and (
              (dr.entity_type = 'client' and dr.entity_id = c.id)
              or (dr.entity_type = 'engagement' and dr.entity_id in (
                select e3.id from public.engagements e3 where e3.client_id = c.id
              ))
            )
        )
      )
      and (
        p_outstanding_balance is null or p_outstanding_balance = exists (
          select 1 from public.invoices inv
          where inv.client_id = c.id
            and inv.status not in ('paid', 'voided', 'cancelled')
            and inv.total_amount > inv.amount_paid
        )
      )
  )
  select
    matched.id,
    matched.client_type,
    matched.first_name,
    matched.last_name,
    matched.business_name,
    matched.primary_email::text,
    matched.primary_phone,
    matched.tags,
    count(*) over() as total_count
  from matched
  order by matched.created_at desc
  limit p_limit offset p_offset;
end;
$search$;

-- Rebuild the Contact workspace index without the removed lifecycle column.
drop index if exists public.clients_workspace_idx;
create index clients_workspace_idx on public.clients (workspace_id, created_at desc);

-- The Contact lifecycle column is now removed for real.
alter table public.clients drop column lifecycle_status;

-- Final database assertions are evaluated inside a DO block because these
-- are procedural checks after the DDL has completed.
do $assert$
begin
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and pg_get_functiondef(p.oid) ilike '%lifecycle_status%'
  ) then
    raise exception 'Migration incomplete: a public function still references lifecycle_status';
  end if;

  if exists (
    select 1
    from public.automations
    where trigger_type like 'lead.%'
  ) then
    raise exception 'Migration incomplete: a Lead-specific automation trigger remains';
  end if;

  if exists (
    select 1
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and not t.tgisinternal
      and pg_get_triggerdef(t.oid) ilike '%lifecycle_status%'
  ) then
    raise exception 'Migration incomplete: a trigger still references lifecycle_status';
  end if;
end;
$assert$;

commit;
