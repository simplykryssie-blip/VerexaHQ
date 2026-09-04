-- Lets staff dismiss a failed automation run from the dashboard's Failed
-- Automation Runs widget without altering its historical status -- the run
-- permanently stays "failed" in the automation's own Activity/run history,
-- this only marks it as seen/handled for the purposes of the live queue.
-- No RLS UPDATE policy exists on automation_runs today (it's normally only
-- written by the automation executor), so acknowledging goes through a
-- permission-gated RPC rather than widening RLS to a raw client update.

alter table public.automation_runs
  add column acknowledged_at timestamptz,
  add column acknowledged_by uuid references auth.users(id);

create or replace function public.acknowledge_automation_run(p_run_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_workspace_id uuid;
begin
  select workspace_id into v_workspace_id from public.automation_runs where id = p_run_id;
  if v_workspace_id is null then
    raise exception 'Automation run not found';
  end if;
  if not public.has_permission(v_workspace_id, 'automations.manage') then
    raise exception 'insufficient permissions';
  end if;

  update public.automation_runs
  set acknowledged_at = now(), acknowledged_by = auth.uid()
  where id = p_run_id;
end;
$$;
