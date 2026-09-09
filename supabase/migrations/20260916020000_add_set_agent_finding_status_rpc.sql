-- ai_agent_findings had a status column (open/investigating/fixed/
-- retest_required/resolved/reopened) and RLS select policies, but no RPC
-- ever let anyone actually change it -- the only writer was
-- create_agent_finding itself (called by the agents). Staff had no way to
-- mark a finding resolved after fixing the underlying issue, or reopen one
-- that came back. Same access gate as reading findings (can_access_admin_ai).

create or replace function public.set_agent_finding_status(
  p_finding_id uuid,
  p_status text,
  p_decision_notes text default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not public.can_access_admin_ai() then
    raise exception 'insufficient permissions';
  end if;

  if p_status not in ('open', 'investigating', 'fixed', 'retest_required', 'resolved', 'reopened') then
    raise exception 'invalid status %', p_status;
  end if;

  update public.ai_agent_findings
  set
    status = p_status,
    decision_notes = coalesce(p_decision_notes, decision_notes),
    reviewed_by = auth.uid(),
    reviewed_at = now(),
    updated_at = now()
  where id = p_finding_id;

  if not found then
    raise exception 'finding % not found', p_finding_id;
  end if;
end;
$function$;
