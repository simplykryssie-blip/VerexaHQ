-- Cuts start_next_automation_step over from "next step by display_order"
-- to real graph traversal via automation_step_edges. Same name/signature
-- as before (called from execute_automation_step and 24 fire_*_automations
-- trigger functions) so none of those callers need to change.
--
-- A condition step is handled entirely here (never passed to
-- execute_automation_step) since it's a pure routing node with no side
-- effect: log it completed, then recurse to evaluate its own outgoing
-- edges immediately.
create or replace function public.start_next_automation_step(p_run_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_run record;
  v_edge record;
  v_next_step_id uuid;
  v_next record;
  v_matched boolean := false;
  v_has_edges boolean;
begin
  select * into v_run from public.automation_runs where id = p_run_id;
  if v_run.status <> 'running' then
    return;
  end if;

  if v_run.current_step_id is null then
    -- Start of the graph: the step with no incoming edges. Lowest
    -- display_order among roots as a deterministic tie-break.
    select s.id into v_next_step_id
    from public.automation_steps s
    where s.automation_id = v_run.automation_id
      and not exists (select 1 from public.automation_step_edges e where e.to_step_id = s.id)
    order by s.display_order asc
    limit 1;
  else
    for v_edge in
      select * from public.automation_step_edges
      where from_step_id = v_run.current_step_id
      order by sort_order asc
    loop
      if v_edge.branch_conditions is null
         or public.evaluate_automation_conditions(v_edge.branch_conditions, v_run.trigger_snapshot, v_run.workspace_id, v_run.client_id, v_run.engagement_id)
      then
        v_next_step_id := v_edge.to_step_id;
        v_matched := true;
        exit;
      end if;
    end loop;

    if not v_matched then
      -- Ran out of edges: either a normal end of chain (no edges at all --
      -- expected, not an error) or a condition step whose branches all
      -- missed with no default/else edge to fall back to. The latter is a
      -- real config gap, so it gets its own visible log entry rather than
      -- silently looking like a clean finish.
      select exists(select 1 from public.automation_step_edges where from_step_id = v_run.current_step_id) into v_has_edges;
      if v_has_edges then
        insert into public.automation_execution_logs (workspace_id, automation_id, engagement_id, status, execution_data, executed_at)
        values (v_run.workspace_id, v_run.automation_id, v_run.engagement_id, 'completed',
          jsonb_build_object('run_id', p_run_id, 'step_id', v_run.current_step_id, 'dead_end', true, 'reason', 'no branch matched and no default edge'),
          now());
      end if;
      update public.automation_runs set status = 'completed', completed_at = now() where id = p_run_id;
      return;
    end if;
  end if;

  if v_next_step_id is null then
    update public.automation_runs set status = 'completed', completed_at = now() where id = p_run_id;
    return;
  end if;

  select * into v_next from public.automation_steps where id = v_next_step_id;
  update public.automation_runs set current_step_id = v_next_step_id where id = p_run_id;

  if v_next.action_type = 'condition' then
    insert into public.automation_execution_logs (workspace_id, automation_id, engagement_id, status, execution_data, executed_at)
    values (v_run.workspace_id, v_run.automation_id, v_run.engagement_id, 'completed',
      jsonb_build_object('run_id', p_run_id, 'step_id', v_next.id, 'action_type', 'condition'), now());
    perform public.start_next_automation_step(p_run_id);
    return;
  end if;

  if v_next.requires_approval then
    insert into public.automation_pending_steps (workspace_id, run_id, automation_step_id, status)
    values (v_run.workspace_id, p_run_id, v_next.id, 'pending_approval');
  elsif v_next.delay_minutes > 0 then
    insert into public.automation_pending_steps (workspace_id, run_id, automation_step_id, status, scheduled_for)
    values (v_run.workspace_id, p_run_id, v_next.id, 'pending_delay', now() + make_interval(mins => v_next.delay_minutes));
  else
    perform public.execute_automation_step(p_run_id, v_next.id);
  end if;
end;
$function$;
