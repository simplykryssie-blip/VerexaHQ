-- ============================================================================
-- MIGRATION RECONCILIATION PHASE 1.9 -- RECOVERED FROM PRODUCTION (PR #268)
--
-- Did not previously exist in Git main. Applied directly to production
-- during the MKB Tax Prep + Client Review + F1/F2/NW-1 security work
-- (PR #268, branch claude/verexa-schema-mismatch-i8c19u, never merged).
-- This filename's version already exactly matches the real recorded
-- production version in supabase_migrations.schema_migrations -- no rename
-- needed. Content verified byte-for-byte (modulo a single trailing
-- newline) against schema_migrations.statements. Confidence: A -- exact
-- original recovered.
-- ============================================================================
-- Phase 4E-A audit finding: request_client_review_changes() inserted a new
-- "Revise return per client feedback" task on every call with no reuse or
-- supersession, so repeated revision cycles piled up simultaneous open
-- duplicate tasks for the same engagement. The desired invariant is ONE
-- ACTIVE (pending/in_progress) revision task per engagement, not one ever
-- -- once staff completes a round's task, the next revision request must
-- be free to open a new one.
--
-- Existing task model (public.tasks) has no task_type/superseded_by
-- column and no 'cancelled' status (only pending/in_progress/completed/
-- blocked), so the correct fit here -- without inventing schema the
-- product doesn't have -- is to key on the task's own literal title plus
-- engagement_id plus "still open" status, and UPSERT into that row rather
-- than always inserting. A completed task falls outside the partial
-- index's predicate, so it is untouched (history preserved) and the next
-- request is free to open a fresh row.
--
-- Concurrency: two simultaneous request_client_review_changes calls could
-- otherwise both read "no open task" and both insert. A plain
-- check-then-insert in PL/pgSQL cannot close that race without either row
-- locking on some parent or a DB-level constraint; a partial unique index
-- is the minimal schema change that actually guarantees the invariant
-- under concurrency, and ON CONFLICT ... DO UPDATE against it is a single
-- atomic statement, so the two-caller race for the *task row* is fully
-- closed by this change. (The separate, broader race on the *stage/status
-- check* shared by all four B13 RPCs -- e.g. two simultaneous
-- approve_client_review calls -- is a different, wider concern than task
-- creation and is out of scope for this fix; it remains a documented,
-- open risk.)
create unique index if not exists tasks_one_open_revision_per_engagement_idx
  on public.tasks (engagement_id)
  where title = 'Revise return per client feedback' and status in ('pending', 'in_progress');

create or replace function public.request_client_review_changes(p_engagement_id uuid, p_comment text default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_workspace_id uuid;
  v_client_id uuid;
  v_stage_name text;
  v_task_id uuid;
  v_description text;
begin
  select workspace_id, client_id, stage_name
  into v_workspace_id, v_client_id, v_stage_name
  from public._get_engagement_active_stage_name(p_engagement_id);

  if v_workspace_id is null then
    raise exception 'engagement not found or has no active pipeline run';
  end if;
  if not public.is_portal_user(v_client_id) then
    raise exception 'not authorized to respond to this engagement';
  end if;
  if not public.is_workspace_operational(v_workspace_id) then
    raise exception 'this workspace is not currently operational';
  end if;
  if v_stage_name is distinct from 'Client Review' then
    raise exception 'this engagement is not currently in client review';
  end if;

  update public.engagements set status = 'Corrections Requested' where id = p_engagement_id;

  insert into public.activity_log (workspace_id, actor_id, entity_type, entity_id, activity_type, event_type, description, metadata)
  values (v_workspace_id, auth.uid(), 'engagement', p_engagement_id, 'CLIENT_REVIEW_CHANGES_REQUESTED', 'CLIENT_REVIEW_CHANGES_REQUESTED', 'Client requested changes to the prepared return', jsonb_build_object('comment', p_comment));

  v_description := coalesce(p_comment, '(no comment provided)');

  insert into public.tasks (workspace_id, engagement_id, title, description, priority, due_date)
  values (v_workspace_id, p_engagement_id, 'Revise return per client feedback', v_description, 'high', (now() + interval '1 day')::date)
  on conflict (engagement_id) where title = 'Revise return per client feedback' and status in ('pending', 'in_progress')
  do update set
    description = public.tasks.description || (E'\n\n--- New client request (' || to_char(now(), 'YYYY-MM-DD HH24:MI') || ') ---\n') || excluded.description,
    due_date = excluded.due_date,
    updated_at = now()
  returning id into v_task_id;

  perform public._notify_workspace_admins_of_engagement_event(v_workspace_id, p_engagement_id, 'client_review_changes_requested', 'client-review-changes-requested-staff-notification', jsonb_build_object('comment', p_comment, 'task_id', v_task_id));
end;
$function$;
