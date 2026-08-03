-- Epic 3A: Engagement Foundation -- Part 8 (advisor cleanup).
--
-- Final advisor pass caught: record_task_completed and
-- record_attachment_uploaded were missing `set search_path`, and
-- record_automation_executed/record_engagement_created were still
-- reachable by anon (Postgres blocks direct invocation of a RETURNS
-- TRIGGER function regardless of grants, so this was never actually
-- exploitable, but it's fixed anyway to match the anon-revoke convention
-- applied to every other function in this project).

create or replace function public.record_task_completed()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'completed' and old.status is distinct from 'completed' then
    insert into public.activity_log (workspace_id, actor_id, entity_type, entity_id, activity_type, event_type, description, metadata)
    values (
      new.workspace_id, (select auth.uid()), 'task', new.id, 'TASK_COMPLETED', 'TASK_COMPLETED',
      'Task "' || new.title || '" was completed',
      jsonb_build_object('engagement_id', new.engagement_id)
    );
  end if;
  return new;
end;
$$;

create or replace function public.record_attachment_uploaded()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  insert into public.activity_log (workspace_id, actor_id, entity_type, entity_id, activity_type, event_type, description, metadata)
  values (
    new.workspace_id, (select auth.uid()), new.entity_type, new.entity_id, 'DOCUMENT_UPLOADED', 'DOCUMENT_UPLOADED',
    'Document "' || new.file_name || '" was uploaded',
    jsonb_build_object('attachment_id', new.id, 'entity_type', new.entity_type)
  );
  return new;
end;
$$;

revoke execute on function public.record_automation_executed() from public, anon;
revoke execute on function public.record_engagement_created() from public, anon;
