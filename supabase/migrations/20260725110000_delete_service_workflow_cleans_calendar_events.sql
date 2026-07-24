-- Found live after shipping delete_service_with_workflow: deleting a service
-- with an active deadline correctly removed the deadline row (confirmed via
-- audit_logs — the deadline had a real service_id/engagement_id at the
-- moment of deletion, so the RPC's own matching clause caught it), but left
-- its workspace_calendar_events row behind. trg_deadlines_calendar_sync only
-- fires on INSERT/UPDATE of deadlines (auto_sync_deadline_calendar_event),
-- there is no DELETE trigger, and sync_deadline_to_calendar() writes the
-- calendar row with source_type='deadline'/source_id=<deadline id> but no
-- engagement_id, so the RPC's existing service_id/engagement_id matching
-- can't reach it either. Confirmed one such orphaned row live for a test
-- client before writing this (workspace_calendar_events.id
-- 0c1b86ba-1e77-45c0-aafe-92e884e59d74, source_id pointing at an already-
-- deleted deadline) and cleaned it up manually; this closes the gap so it
-- can't recur.
create or replace function public.delete_service_with_workflow(p_service_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_workspace_id uuid;
  v_engagement_id uuid;
  v_deadline_ids uuid[];
  v_task_count int := 0;
  v_deadline_count int := 0;
  v_document_count int := 0;
  v_form_count int := 0;
  v_checklist_count int := 0;
  v_calendar_event_count int := 0;
  v_retained_invoices int := 0;
  v_retained_documents int := 0;
  v_retained_signatures int := 0;
  v_retained_tax_returns int := 0;
  v_retained_formation_filings int := 0;
  v_retained_state_registrations int := 0;
  v_retained_audit_events int := 0;
begin
  select workspace_id into v_workspace_id from public.services where id = p_service_id;
  if v_workspace_id is null then
    raise exception 'Service not found.';
  end if;

  if not public.can_staff_write(v_workspace_id) then
    raise exception 'You do not have permission to delete this service.';
  end if;

  select id into v_engagement_id from public.engagements where service_id = p_service_id limit 1;

  -- Retention checks: block deletion outright when financial, filed, or
  -- audited records exist, rather than silently orphaning them (or, for
  -- documents/invoices/tax_returns specifically, hitting an immutable
  -- audit_events conflict mid-delete — see the note above). 'Canceled' is
  -- a real, already-supported services.service_status value (used
  -- unchanged by NewServiceModal) — the error message points staff there
  -- instead of this function inventing a new archive concept.
  select count(*) into v_retained_invoices from public.invoices where engagement_id = v_engagement_id;
  select count(*) into v_retained_documents from public.documents where service_id = p_service_id or engagement_id = v_engagement_id;
  select count(*) into v_retained_signatures from public.signature_requests where service_id = p_service_id;
  select count(*) into v_retained_tax_returns from public.tax_returns where engagement_id = v_engagement_id;
  select count(*) into v_retained_formation_filings from public.business_formation_filings where engagement_id = v_engagement_id;
  select count(*) into v_retained_state_registrations from public.state_registrations where engagement_id = v_engagement_id;
  select count(*) into v_retained_audit_events from public.audit_events where engagement_id = v_engagement_id;

  if v_retained_invoices > 0 or v_retained_documents > 0 or v_retained_signatures > 0 or v_retained_tax_returns > 0
     or v_retained_formation_filings > 0 or v_retained_state_registrations > 0 or v_retained_audit_events > 0 then
    raise exception 'This service has retained records that must be preserved (invoices: %, documents: %, signed documents: %, tax returns: %, formation filings: %, state registrations: %, audit history: %). Cancel the service (set its status to Canceled) instead of deleting it.',
      v_retained_invoices, v_retained_documents, v_retained_signatures, v_retained_tax_returns, v_retained_formation_filings, v_retained_state_registrations, v_retained_audit_events;
  end if;

  -- Matched by service_id OR engagement_id (not engagement_id alone) —
  -- some of these rows can exist with a service_id but no engagement_id
  -- (e.g. a service that was never activated into a workflow), and
  -- matching only one side would leave those behind uncounted.
  select count(*) into v_task_count from public.tasks where service_id = p_service_id or engagement_id = v_engagement_id;
  select array_agg(id), count(*) into v_deadline_ids, v_deadline_count from public.deadlines where service_id = p_service_id or engagement_id = v_engagement_id;
  select count(*) into v_document_count from public.documents where service_id = p_service_id or engagement_id = v_engagement_id;
  select count(*) into v_form_count from public.client_form_assignments where service_id = p_service_id or engagement_id = v_engagement_id;
  select count(*) into v_checklist_count from public.client_checklist_items where service_id = p_service_id or engagement_id = v_engagement_id;

  -- workspace_calendar_events rows auto-generated from a deadline (see
  -- sync_deadline_to_calendar) point back via source_type/source_id, not a
  -- foreign key, and never carry engagement_id — so they must be matched
  -- and deleted by the captured deadline id list before those deadlines
  -- are gone, or they'd become unreachable orphans.
  if v_deadline_ids is not null then
    select count(*) into v_calendar_event_count from public.workspace_calendar_events
      where source_type = 'deadline' and source_id = any(v_deadline_ids);
    delete from public.workspace_calendar_events
      where source_type = 'deadline' and source_id = any(v_deadline_ids);
  end if;

  delete from public.tasks where service_id = p_service_id or engagement_id = v_engagement_id;
  delete from public.deadlines where service_id = p_service_id or engagement_id = v_engagement_id;
  delete from public.documents where service_id = p_service_id or engagement_id = v_engagement_id;
  delete from public.client_form_assignments where service_id = p_service_id or engagement_id = v_engagement_id;
  delete from public.client_checklist_items where service_id = p_service_id or engagement_id = v_engagement_id;

  if v_engagement_id is not null then
    delete from public.engagements where id = v_engagement_id;
  end if;

  delete from public.services where id = p_service_id;

  return jsonb_build_object(
    'service_id', p_service_id,
    'engagement_id', v_engagement_id,
    'deleted_tasks', v_task_count,
    'deleted_deadlines', v_deadline_count,
    'deleted_documents', v_document_count,
    'deleted_form_assignments', v_form_count,
    'deleted_checklist_items', v_checklist_count,
    'deleted_calendar_events', v_calendar_event_count
  );
end;
$function$;

revoke execute on function public.delete_service_with_workflow(uuid) from public, anon;
grant execute on function public.delete_service_with_workflow(uuid) to authenticated;
