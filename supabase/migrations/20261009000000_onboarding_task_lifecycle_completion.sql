-- Phase 6I: complete onboarding-generated tasks when the work they
-- represent is actually resolved (Model C hybrid, per the Phase 6I
-- read-only audit).
--
-- Scope, exactly: record_partner_onboarding_review() and
-- withdraw_partner_onboarding() gain a synchronous, in-transaction task
-- completion step on approve/reject/withdraw; _maybe_enter_review() gains
-- an existence guard against stacking a second open review-decision task
-- on an info-requested resubmission. Every completion/guard is matched
-- only by firm_connection_id + the onboarding engine's own exact task
-- titles + an open status (pending/in_progress/blocked) -- never a bare
-- firm_connection_id sweep. No task/onboarding schema change, no new
-- status, no partner_onboarding_id column, no cross-reapplication scan.
--
-- Why this is safe across reapplication: partner_onboardings_active_per_connection
-- guarantees at most one *live* (non-terminal) onboarding per connection at
-- any moment. Every completion below runs synchronously inside the RPC
-- that is transitioning THE live onboarding on that connection, so the
-- firm_connection_id + title + open-status predicate can only ever match
-- that same onboarding's own tasks -- a prior onboarding's tasks on the
-- same connection were already completed (or never existed) by the time it
-- became terminal, and a later reapplication's tasks don't exist yet.

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

    -- An info-requested decision sends this same onboarding back through
    -- here on resubmission (status returns to in_progress, then re-enters
    -- review once still-satisfied). record_partner_onboarding_review
    -- deliberately does not complete this task on info_requested, so
    -- without this guard a resubmission would stack a second open
    -- "Approve or reject partner onboarding" task on top of the one still
    -- open from the first pass.
    if not exists (
      select 1 from public.tasks
      where firm_connection_id = v_onboarding.firm_connection_id
        and title = 'Approve or reject partner onboarding'
        and status in ('pending', 'in_progress', 'blocked')
    ) then
      insert into public.tasks (workspace_id, firm_connection_id, title, description, priority, assigned_staff_id, visibility)
      values (
        v_onboarding.workspace_id, v_onboarding.firm_connection_id,
        'Approve or reject partner onboarding',
        'Application, agreement, and required documents are complete. Review and decide.',
        'high', public._resolve_onboarding_default_reviewer(v_onboarding.workspace_id, v_onboarding.firm_connection_id), 'internal'
      );
    end if;
  end if;
end;
$function$;

create or replace function public.record_partner_onboarding_review(p_workspace_id uuid, p_onboarding_id uuid, p_decision text, p_note text default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_onboarding record;
begin
  if p_decision not in ('approved', 'rejected', 'info_requested') then
    raise exception 'invalid review decision: %', p_decision;
  end if;
  if not public.is_workspace_admin(p_workspace_id) then
    raise exception 'insufficient permissions to review onboarding for this workspace';
  end if;

  select * into v_onboarding from public.partner_onboardings where id = p_onboarding_id and workspace_id = p_workspace_id;
  if v_onboarding.id is null then
    raise exception 'onboarding record not found';
  end if;
  if v_onboarding.status <> 'under_review' then
    raise exception 'this onboarding is not currently under review';
  end if;

  update public.partner_onboardings
  set review_decision = p_decision,
      review_note = p_note,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      status = case p_decision
        when 'approved' then 'setup'
        when 'rejected' then 'rejected'
        else 'in_progress'
      end,
      rejected_reason = case when p_decision = 'rejected' then p_note else rejected_reason end,
      rejected_at = case when p_decision = 'rejected' then now() else rejected_at end
  where id = p_onboarding_id;

  -- An approve/reject decision discharges both the application review and
  -- the decision itself -- complete whichever of the two onboarding
  -- task titles are still open for this connection. info_requested is
  -- deliberately excluded: the review cycle is still active, so the
  -- decision task stays open (duplicate creation on resubmission is
  -- guarded in _maybe_enter_review instead).
  if p_decision in ('approved', 'rejected') then
    update public.tasks
    set status = 'completed', completed_at = now()
    where firm_connection_id = v_onboarding.firm_connection_id
      and title in ('Review new partner application', 'Approve or reject partner onboarding')
      and status in ('pending', 'in_progress', 'blocked');
  end if;
end;
$function$;

create or replace function public.withdraw_partner_onboarding(p_workspace_id uuid, p_onboarding_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_onboarding record;
begin
  if not public.is_workspace_admin(p_workspace_id) then
    raise exception 'insufficient permissions to withdraw onboarding for this workspace';
  end if;

  select * into v_onboarding from public.partner_onboardings where id = p_onboarding_id and workspace_id = p_workspace_id;
  if v_onboarding.id is null then
    raise exception 'onboarding record not found';
  end if;

  update public.partner_onboardings
  set status = 'withdrawn', withdrawn_at = now(), rejected_reason = coalesce(p_reason, rejected_reason)
  where id = p_onboarding_id;

  -- Same synchronous, narrowly-scoped completion as approve/reject above --
  -- withdrawal can happen from any open stage, so both task titles are
  -- considered and the open-status predicate makes a second withdraw() a
  -- safe no-op (nothing left to match).
  update public.tasks
  set status = 'completed', completed_at = now()
  where firm_connection_id = v_onboarding.firm_connection_id
    and title in ('Review new partner application', 'Approve or reject partner onboarding')
    and status in ('pending', 'in_progress', 'blocked');
end;
$function$;
