-- Phase 6H: onboarding tasks default to the connection's reviewer.
--
-- Fixes the two Phase 6H P0/P1 findings:
-- 1. Both onboarding-generated tasks were created with assigned_staff_id
--    always NULL -- "Review new partner application" never set it at all,
--    and "Approve or reject partner onboarding" read
--    partner_onboardings.assigned_staff_id, a column nothing has ever
--    written to. Neither used firm_connections.default_reviewer_id, the
--    field that actually answers "who normally handles this partner."
-- 2. (UI half, handled in app/(app)/assignments/page.tsx) -- not this file.
--
-- Model (approved): default_reviewer_id seeds a new task's assigned_staff_id
-- at creation time only. It is never referenced again afterward -- a later
-- reassignment or a later change to default_reviewer_id never touches an
-- already-created task. partner_onboardings.assigned_staff_id remains
-- unused; it is not revived.

-- Resolves the effective default reviewer for a firm connection's parent
-- workspace: the reviewer must currently be an active member of that same
-- workspace, so a stale or cross-workspace default_reviewer_id (there is no
-- FK on this column) can never seed a task assigned to someone outside the
-- workspace the task itself belongs to. Reuses workspace_users, the
-- existing membership relationship -- no new table.
create or replace function public._resolve_onboarding_default_reviewer(p_workspace_id uuid, p_firm_connection_id uuid)
returns uuid
language sql
stable
security definer
set search_path to 'public'
as $function$
  select fc.default_reviewer_id
  from public.firm_connections fc
  where fc.id = p_firm_connection_id
    and fc.default_reviewer_id is not null
    and exists (
      select 1 from public.workspace_users wu
      where wu.workspace_id = p_workspace_id
        and wu.user_id = fc.default_reviewer_id
        and wu.status = 'active'
    );
$function$;

create or replace function public.submit_partner_onboarding_application(p_workspace_id uuid, p_onboarding_id uuid, p_application_data jsonb)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_onboarding record;
begin
  select po.* into v_onboarding
  from public.partner_onboardings po
  join public.firm_connections fc on fc.id = po.firm_connection_id
  where po.id = p_onboarding_id and fc.child_workspace_id = p_workspace_id;

  if v_onboarding.id is null then
    raise exception 'onboarding record not found';
  end if;
  if not public.is_workspace_member(p_workspace_id) then
    raise exception 'insufficient permissions to submit this application';
  end if;
  if v_onboarding.status not in ('pending', 'in_progress') then
    raise exception 'this application is no longer open for edits';
  end if;

  update public.partner_onboardings
  set application_data = p_application_data,
      application_submitted_at = now(),
      status = case when status = 'pending' then 'in_progress' else status end
  where id = p_onboarding_id;

  insert into public.tasks (workspace_id, firm_connection_id, title, description, priority, assigned_staff_id, visibility)
  values (
    v_onboarding.workspace_id, v_onboarding.firm_connection_id,
    'Review new partner application',
    'A partner application was submitted and is ready for review once all onboarding requirements are complete.',
    'medium', public._resolve_onboarding_default_reviewer(v_onboarding.workspace_id, v_onboarding.firm_connection_id), 'internal'
  );

  perform public._maybe_enter_review(p_onboarding_id);
end;
$function$;

create or replace function public._maybe_enter_review(p_onboarding_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_onboarding record;
  v_agreement_signed boolean;
  v_documents_done boolean;
begin
  select * into v_onboarding from public.partner_onboardings where id = p_onboarding_id;
  if v_onboarding.id is null or v_onboarding.status <> 'in_progress' then
    return;
  end if;
  if v_onboarding.application_submitted_at is null then
    return;
  end if;

  v_agreement_signed := not v_onboarding.agreement_required or exists (
    select 1 from public.signature_requests where id = v_onboarding.agreement_signature_request_id and status = 'completed'
  );
  v_documents_done := not v_onboarding.documents_required or exists (
    select 1 from public.document_requests where id = v_onboarding.document_request_id and status = 'completed'
  );

  if v_agreement_signed and v_documents_done then
    update public.partner_onboardings set status = 'under_review' where id = p_onboarding_id;

    insert into public.tasks (workspace_id, firm_connection_id, title, description, priority, assigned_staff_id, visibility)
    values (
      v_onboarding.workspace_id, v_onboarding.firm_connection_id,
      'Approve or reject partner onboarding',
      'Application, agreement, and required documents are complete. Review and decide.',
      'high', public._resolve_onboarding_default_reviewer(v_onboarding.workspace_id, v_onboarding.firm_connection_id), 'internal'
    );
  end if;
end;
$function$;
