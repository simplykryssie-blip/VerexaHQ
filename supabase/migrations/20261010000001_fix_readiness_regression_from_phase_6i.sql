-- Regression fix, found live during Phase 6J-1's own regression testing
-- (Test K: "verify Phase 6A-6I behavior remains unchanged... readiness").
--
-- Phase 6G (20261007000000_partner_onboarding_completion_engine.sql) added
-- `perform public._maybe_reach_partner_onboarding_ready(p_onboarding_id);`
-- to the end of record_partner_onboarding_review, fixing the setup->ready
-- dead-end for an onboarding with no outstanding training/bank-software
-- requirement. Phase 6I's CREATE OR REPLACE of this same function (to add
-- the task-completion step on approve/reject) was written from the
-- Phase 6B-era body and silently dropped that line -- an approval with
-- zero setup requirements has been stuck at 'setup' instead of reaching
-- 'ready' since Phase 6I shipped, undetected until this phase's own
-- regression pass exercised it.
--
-- This restores exactly that one call. Nothing else in the function
-- changes -- the Phase 6I task-completion behavior stays exactly as it was.
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

  -- Phase 6I: an approve/reject decision discharges both the application
  -- review and the decision itself -- complete whichever of the two
  -- onboarding task titles are still open for this connection.
  -- info_requested is deliberately excluded: the review cycle is still
  -- active, so the decision task stays open (duplicate creation on
  -- resubmission is guarded in _maybe_enter_review instead).
  if p_decision in ('approved', 'rejected') then
    update public.tasks
    set status = 'completed', completed_at = now()
    where firm_connection_id = v_onboarding.firm_connection_id
      and title in ('Review new partner application', 'Approve or reject partner onboarding')
      and status in ('pending', 'in_progress', 'blocked');
  end if;

  -- Phase 6G (restored): guarded no-op for any onboarding that still has an
  -- outstanding training/bank-software requirement -- safe to call
  -- unconditionally after every review decision.
  perform public._maybe_reach_partner_onboarding_ready(p_onboarding_id);
end;
$function$;
