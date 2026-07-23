-- Deleting a `services` row directly (the only path before this, used by
-- NewServiceModal's Delete button) left its engagement and every
-- generated task/deadline/document/form-assignment/checklist-item behind
-- as orphaned data: those FKs (engagements.service_id, tasks.service_id,
-- deadlines.service_id/engagement_id, documents.engagement_id,
-- client_form_assignments.*, client_checklist_items.*) are all
-- ON DELETE SET NULL, never CASCADE. Confirmed live before writing this:
-- one test client had 3 orphaned engagements and 17 orphaned tasks from
-- repeated manual service deletion. This function replaces that direct
-- delete with a single transactional, permission-checked, count-returning
-- RPC that removes a service's full workflow together, or refuses if the
-- service has retained financial/filed records.
--
-- Every table this function deletes from already carries its own
-- AFTER DELETE audit trigger (log_firmflow_change / audit_row_change —
-- confirmed live on services, engagements, tasks, deadlines, documents),
-- so no separate manual audit_events insert is added here: each deleted
-- row is already logged individually by the existing per-table triggers.
--
-- IMPORTANT, confirmed live by testing before shipping this: audit_events
-- is immutable (trg_prevent_audit_mutation blocks UPDATE/DELETE on it
-- unconditionally, including the automatic FK-driven SET NULL that fires
-- when a referenced engagement is deleted). audit_row_change() — the
-- trigger function behind invoices, documents, tax_returns, and
-- engagements' own audit trail — writes audit_events.engagement_id from
-- the audited row's own engagement_id column. So the instant an
-- engagement has ever had an invoice, a document, or a tax return
-- recorded against it, an audit_events row permanently references it,
-- and that engagement can never be hard-deleted again — not a bug to
-- work around, an intentional consequence of immutable audit logging.
-- (engagements' own trg_audit_engagements is safe: the engagements table
-- has no engagement_id column on itself, so that specific event never
-- self-locks.) This function checks audit_events directly, in addition
-- to the named categories below, so it fails closed for any other
-- audited table this comment doesn't enumerate rather than attempting a
-- delete that Postgres would reject with an opaque error.
create or replace function public.delete_service_with_workflow(p_service_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_workspace_id uuid;
  v_engagement_id uuid;
  v_task_count int := 0;
  v_deadline_count int := 0;
  v_document_count int := 0;
  v_form_count int := 0;
  v_checklist_count int := 0;
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
  select count(*) into v_deadline_count from public.deadlines where service_id = p_service_id or engagement_id = v_engagement_id;
  select count(*) into v_document_count from public.documents where service_id = p_service_id or engagement_id = v_engagement_id;
  select count(*) into v_form_count from public.client_form_assignments where service_id = p_service_id or engagement_id = v_engagement_id;
  select count(*) into v_checklist_count from public.client_checklist_items where service_id = p_service_id or engagement_id = v_engagement_id;

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
    'deleted_checklist_items', v_checklist_count
  );
end;
$function$;

revoke execute on function public.delete_service_with_workflow(uuid) from public, anon;
grant execute on function public.delete_service_with_workflow(uuid) to authenticated;
