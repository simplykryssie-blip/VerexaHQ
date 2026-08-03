-- Epic 3A: Engagement Foundation -- Part 2 (universal attachments + security fixes).
--
-- More drift discovered after 0048: the same external process had already
-- altered public.client_documents (built in the Progressive Disclosure
-- sprint, migration 0046) -- renamed client_id -> entity_id, added
-- entity_type/category/tags/version/uploader_id -- clearly attempting to
-- turn it into a polymorphic attachments engine. But the rename left the
-- original client_id_fkey constraint in place, still pointing entity_id at
-- clients(id) ONLY -- so despite the entity_type column, this table could
-- never actually attach to an Engagement/Task/Workflow/etc; any row with
-- entity_type != 'client' would violate the FK. v_engagement_progress
-- (also drift, fixed below) already queries it assuming entity_type =
-- 'engagement' rows exist, which could never have worked.
--
-- Rather than reverting this and building a second, separate "Attachments"
-- table (a real duplicate-structure violation), this migration finishes
-- what the rename started: drops the wrongly-scoped FK (a true polymorphic
-- association can't have a single-target foreign key), adds a proper
-- entity_type check constraint covering every attach point Epic 3A asks
-- for, drops the redundant uploader_id (uploaded_by already covers this,
-- and is what the existing RLS/permissions/tests reference), and renames
-- the table to `attachments` since it no longer has anything client-specific
-- about its shape. 0 rows existed, so this is a pure schema fix, not a data
-- migration.
--
-- Also fixes, from the same advisor pass that caught the tasks RLS hole:
--   - 3 undocumented views (v_workflow_sla_status, v_engagement_progress,
--     v_reviewer_queue) were running as SECURITY DEFINER (ERROR-level) --
--     they'd enforce the view owner's access, not the querying user's.
--   - 4 undocumented functions (generate_engagement_number,
--     audit_workflow_event, start_engagement_workflow,
--     check_stage_readiness) had a mutable search_path.
--   - process_stages had gained expected_duration/warning_threshold/
--     critical_threshold columns (used by v_workflow_sla_status) with no
--     migration file -- captured here (IF NOT EXISTS) for git parity.

-- ============================================================================
-- 1. process_stages drift capture (idempotent -- already live)
-- ============================================================================
alter table public.process_stages add column if not exists expected_duration interval;
alter table public.process_stages add column if not exists warning_threshold interval;
alter table public.process_stages add column if not exists critical_threshold interval;

-- ============================================================================
-- 2. Fix client_documents -> attachments: make entity_id genuinely polymorphic
-- ============================================================================
alter table public.client_documents drop constraint if exists client_documents_client_id_fkey;
alter table public.client_documents drop column if exists uploader_id;

alter table public.client_documents add constraint client_documents_entity_type_check check (entity_type in (
  'client', 'engagement', 'workflow', 'task', 'invoice', 'document', 'blueprint', 'message'
));
alter table public.client_documents alter column entity_type set not null;
alter table public.client_documents alter column entity_type set default 'client';

-- idx_attachments_entity(entity_type, entity_id) already exists (created by
-- the same external drift, already under its final name) -- nothing to add.

alter table public.client_documents rename to attachments;
alter index if exists client_documents_pkey rename to attachments_pkey;

comment on table public.attachments is 'Universal attachments engine: one polymorphic table (entity_type/entity_id) for files attached to a Client, Engagement, Workflow, Task, Invoice, Document, Blueprint, or Message, instead of a separate table per entity. entity_id has no single-target FK -- a true polymorphic association can''t have one -- integrity is enforced by entity_type + application code, the same tradeoff blueprint_components already makes for polymorphic config-object membership.';

-- ============================================================================
-- 3. Fix the 3 undocumented SECURITY DEFINER views (ERROR-level advisor
--    finding) and repoint v_engagement_progress at the renamed table.
-- ============================================================================
create or replace view public.v_engagement_progress
with (security_invoker = true) as
with stage_counts as (
  select wr_1.engagement_id,
    count(*) as total_tasks,
    count(*) filter (where ws.status = 'Completed'::workflow_stage_status) as completed_tasks
  from workflow_stages ws
  join workflow_runs wr_1 on ws.workflow_run_id = wr_1.id
  group by wr_1.engagement_id
), doc_counts as (
  select attachments.entity_id as engagement_id,
    count(*) as total_docs,
    count(*) filter (where attachments.category = 'Final'::text or attachments.tags @> array['Verified'::text]) as verified_docs
  from public.attachments
  where attachments.entity_type = 'engagement'::text
  group by attachments.entity_id
)
select e.id as engagement_id,
  e.engagement_number,
  wr.status as workflow_status,
  coalesce(sc.completed_tasks::double precision / nullif(sc.total_tasks, 0)::double precision * 100::double precision, 0::double precision) as task_progress_pct,
  coalesce(dc.verified_docs::double precision / nullif(dc.total_docs, 0)::double precision * 100::double precision, 0::double precision) as document_progress_pct,
  case
    when wr.status = 'Completed'::workflow_run_status then 100::double precision
    else (coalesce(sc.completed_tasks::double precision / nullif(sc.total_tasks, 0)::double precision, 0::double precision) * 0.7::double precision
      + coalesce(dc.verified_docs::double precision / nullif(dc.total_docs, 0)::double precision, 0::double precision) * 0.3::double precision) * 100::double precision
  end as overall_progress_pct
from engagements e
left join workflow_runs wr on wr.engagement_id = e.id
left join stage_counts sc on sc.engagement_id = e.id
left join doc_counts dc on dc.engagement_id = e.id;

create or replace view public.v_reviewer_queue
with (security_invoker = true) as
select ws.id as workflow_stage_id,
  ws.workspace_id,
  e.engagement_number,
  e.client_id,
  ws.stage_name,
  ws.reviewer_id,
  ws.status,
  ws.due_date,
  ws.started_at
from workflow_stages ws
join workflow_runs wr on ws.workflow_run_id = wr.id
join engagements e on wr.engagement_id = e.id
where ws.status = any (array['Waiting'::workflow_stage_status, 'In Progress'::workflow_stage_status])
  and ws.reviewer_id is not null;

create or replace view public.v_workflow_sla_status
with (security_invoker = true) as
select ws.id as workflow_stage_id,
  ws.workflow_run_id,
  ws.stage_name,
  ws.status,
  ws.due_date,
  ws.started_at,
  case
    when ws.completed_at is not null then ws.completed_at - ws.started_at
    else now() - ws.started_at
  end as time_elapsed,
  ps.expected_duration,
  case
    when ws.status = 'Completed'::workflow_stage_status then 'Completed'::text
    when ws.due_date is not null and now() > ws.due_date then 'Overdue'::text
    when ps.expected_duration is not null and now() - ws.started_at > ps.expected_duration then 'Exceeded'::text
    else 'On Track'::text
  end as sla_category
from workflow_stages ws
join process_stages ps on ws.stage_name = ps.name;

-- ============================================================================
-- 4. Fix mutable search_path on the 4 undocumented functions.
-- ============================================================================
create or replace function public.generate_engagement_number()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_year text := to_char(now(), 'YYYY');
  v_next bigint;
begin
  if new.engagement_number is not null then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(new.workspace_id::text || v_year, 0));

  select count(*) + 1 into v_next
  from public.engagements
  where workspace_id = new.workspace_id and to_char(open_date, 'YYYY') = v_year;

  new.engagement_number := 'ENG-' || v_year || '-' || lpad(v_next::text, 6, '0');
  return new;
end;
$$;

create or replace function public.audit_workflow_event()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  insert into activity_log (workspace_id, entity_type, entity_id, activity_type, event_type, description, metadata)
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
$$;

create or replace function public.start_engagement_workflow(p_engagement_id uuid, p_process_id uuid)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_run_id uuid;
  v_workspace_id uuid;
begin
  select workspace_id into v_workspace_id from engagements where id = p_engagement_id;

  insert into workflow_runs (workspace_id, engagement_id, process_id, status, started_at)
  values (v_workspace_id, p_engagement_id, p_process_id, 'Active', now())
  returning id into v_run_id;

  insert into workflow_stages (workspace_id, workflow_run_id, process_stage_id, stage_name, display_order)
  select v_workspace_id, v_run_id, id, name, display_order
  from process_stages
  where process_id = p_process_id
  order by display_order asc;

  update workflow_runs
  set current_stage_id = (select id from workflow_stages where workflow_run_id = v_run_id order by display_order asc limit 1)
  where id = v_run_id;

  update workflow_stages
  set status = 'In Progress', started_at = now()
  where id = (select current_stage_id from workflow_runs where id = v_run_id);

  return v_run_id;
end;
$$;

create or replace function public.check_stage_readiness(p_workflow_stage_id uuid)
returns table(is_ready boolean, missing_requirements text[])
language plpgsql
set search_path = public
as $$
declare
  v_missing text[] := array[]::text[];
  v_incomplete_stages int;
begin
  select count(*) into v_incomplete_stages
  from workflow_stages ws
  where ws.workflow_run_id = (
    select workflow_run_id from workflow_stages where id = p_workflow_stage_id
  )
  and ws.display_order < (
    select display_order from workflow_stages where id = p_workflow_stage_id
  )
  and ws.status != 'Completed';

  if v_incomplete_stages > 0 then
    v_missing := array_append(v_missing, 'Incomplete Prior Stages (' || v_incomplete_stages || ')');
  end if;

  return query select (array_length(v_missing, 1) is null or array_length(v_missing, 1) = 0), v_missing;
end;
$$;

revoke execute on function public.start_engagement_workflow(uuid, uuid) from public, anon;
grant execute on function public.start_engagement_workflow(uuid, uuid) to authenticated;
revoke execute on function public.check_stage_readiness(uuid) from public, anon;
grant execute on function public.check_stage_readiness(uuid) to authenticated;
