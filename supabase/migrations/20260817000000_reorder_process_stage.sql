-- The Pipelines builder had rename/delete for stages but no way to
-- reorder them at all -- confirmed no reorder_* RPC existed for
-- process_stages (unlike automation_steps, which already had one).
-- Mirrors reorder_automation_step's swap-with-neighbor approach and
-- rename_process_stage's permission/system-default checks.

create or replace function public.reorder_process_stage(p_stage_id uuid, p_direction text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_stage record;
  v_process record;
  v_neighbor record;
begin
  if p_direction not in ('up', 'down') then
    raise exception 'direction must be up or down';
  end if;

  select ps.id, ps.process_id, ps.display_order into v_stage from process_stages ps where ps.id = p_stage_id;
  if v_stage.id is null then
    raise exception 'stage % not found', p_stage_id;
  end if;

  select p.id, p.workspace_id into v_process from processes p where p.id = v_stage.process_id;
  if v_process.workspace_id is null then
    raise exception 'cannot edit a system default workflow -- clone the service first';
  end if;
  if not is_workspace_admin(v_process.workspace_id) then
    raise exception 'insufficient permissions to edit this workflow';
  end if;

  if p_direction = 'up' then
    select * into v_neighbor from public.process_stages
    where process_id = v_stage.process_id and display_order < v_stage.display_order
    order by display_order desc limit 1;
  else
    select * into v_neighbor from public.process_stages
    where process_id = v_stage.process_id and display_order > v_stage.display_order
    order by display_order asc limit 1;
  end if;

  if v_neighbor.id is null then
    return;
  end if;

  update public.process_stages set display_order = v_neighbor.display_order, updated_at = now() where id = v_stage.id;
  update public.process_stages set display_order = v_stage.display_order, updated_at = now() where id = v_neighbor.id;
end;
$function$;

grant execute on function public.reorder_process_stage(uuid, text) to authenticated;
