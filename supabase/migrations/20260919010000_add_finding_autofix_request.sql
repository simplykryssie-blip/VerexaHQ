-- Lets staff request an unattended fix for a specific finding from the
-- findings page, instead of only being able to change its status by hand.
-- A separate polling Routine (not part of this migration) picks up
-- 'requested' rows, investigates, and either fixes+pushes or backs off to
-- 'needs_review' when it isn't confident -- see
-- .claude/skills/verexa-finding-autofix-agent/SKILL.md.

alter table public.ai_agent_findings
  add column if not exists autofix_status text not null default 'none'
    check (autofix_status in ('none', 'requested', 'in_progress', 'fixed', 'needs_review', 'failed')),
  add column if not exists autofix_requested_by uuid references auth.users(id),
  add column if not exists autofix_requested_at timestamptz,
  add column if not exists autofix_note text,
  add column if not exists autofix_updated_at timestamptz;

create index if not exists ai_agent_findings_autofix_status_idx on public.ai_agent_findings(autofix_status) where autofix_status = 'requested';

-- Staff-facing: request (or re-request) an unattended fix.
create or replace function public.request_finding_autofix(p_finding_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not public.can_access_admin_ai() then
    raise exception 'insufficient permissions';
  end if;

  update public.ai_agent_findings
  set autofix_status = 'requested',
      autofix_requested_by = auth.uid(),
      autofix_requested_at = now(),
      autofix_note = null,
      autofix_updated_at = now()
  where id = p_finding_id;

  if not found then
    raise exception 'finding % not found', p_finding_id;
  end if;
end;
$function$;

-- Agent-facing: report autofix progress/outcome. Same access gate as every
-- other admin-AI write -- the agent calls this as an impersonated real
-- platform admin/AI operator, same pattern as set_agent_finding_status.
create or replace function public.set_finding_autofix_result(
  p_finding_id uuid,
  p_autofix_status text,
  p_note text default null
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

  if p_autofix_status not in ('none', 'requested', 'in_progress', 'fixed', 'needs_review', 'failed') then
    raise exception 'invalid autofix_status %', p_autofix_status;
  end if;

  update public.ai_agent_findings
  set autofix_status = p_autofix_status,
      autofix_note = coalesce(p_note, autofix_note),
      autofix_updated_at = now()
  where id = p_finding_id;

  if not found then
    raise exception 'finding % not found', p_finding_id;
  end if;
end;
$function$;
