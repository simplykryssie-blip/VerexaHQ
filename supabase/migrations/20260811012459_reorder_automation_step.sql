-- automation_steps(automation_id, display_order) is a DEFERRABLE INITIALLY
-- DEFERRED unique constraint specifically so a swap like this can happen
-- within one transaction without a transient collision -- doing the two
-- updates as separate client requests would violate it immediately instead.

create or replace function public.reorder_automation_step(p_step_id uuid, p_direction text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_step record;
  v_neighbor record;
  v_workspace_id uuid;
begin
  if p_direction not in ('up', 'down') then
    raise exception 'direction must be up or down';
  end if;

  select s.*, a.workspace_id into v_step
  from public.automation_steps s
  join public.automations a on a.id = s.automation_id
  where s.id = p_step_id;

  if v_step.id is null then
    raise exception 'step not found';
  end if;

  v_workspace_id := v_step.workspace_id;
  if v_workspace_id is null or not public.is_workspace_admin(v_workspace_id) then
    raise exception 'insufficient permissions to reorder this workflow''s steps';
  end if;

  if p_direction = 'up' then
    select * into v_neighbor from public.automation_steps
    where automation_id = v_step.automation_id and display_order < v_step.display_order
    order by display_order desc limit 1;
  else
    select * into v_neighbor from public.automation_steps
    where automation_id = v_step.automation_id and display_order > v_step.display_order
    order by display_order asc limit 1;
  end if;

  if v_neighbor.id is null then
    return;
  end if;

  update public.automation_steps set display_order = v_neighbor.display_order where id = v_step.id;
  update public.automation_steps set display_order = v_step.display_order where id = v_neighbor.id;
end;
$function$;

revoke all on function public.reorder_automation_step(uuid, text) from public, anon;
grant execute on function public.reorder_automation_step(uuid, text) to authenticated;
