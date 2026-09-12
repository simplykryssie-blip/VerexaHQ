-- sync_automation_step_edges() (BEFORE DELETE on automation_steps) only ever
-- rewired a *plain* (unlabeled, condition-less) incoming edge around a
-- deleted step, and only the first one found via "limit 1". That leaves two
-- real "deleting a step disconnects the line" cases unfixed:
--   - a step reached via a condition's Yes/No (or any labeled) branch: that
--     branch edge was explicitly excluded ("branch_conditions is null and
--     label is null"), so deleting the step it points to just strands the
--     branch (to_step_id -> null via the FK's ON DELETE SET NULL) instead of
--     reconnecting it to whatever came after the deleted step;
--   - a step with more than one incoming edge (e.g. two different branches
--     that both happen to converge on the same next step): only one of them
--     got rewired, the rest were stranded the same way.
-- Fix: rewire *every* edge whose to_step_id is the step being deleted (not
-- just the single plain one) to the deleted step's own single plain
-- outgoing target, leaving each edge's own label/branch_conditions
-- untouched -- only to_step_id is written. A step with no outgoing edge
-- (a true dead end) still leaves its incoming edges to be nulled by the FK
-- cascade, which is correct: there's nothing after it to reconnect to.

create or replace function public.sync_automation_step_edges()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_outgoing_edge public.automation_step_edges%rowtype;
begin
  if not exists (select 1 from public.automations where id = old.automation_id) then
    return old;
  end if;

  if old.action_type = 'condition' then
    return old;
  end if;

  select * into v_outgoing_edge
  from public.automation_step_edges
  where from_step_id = old.id and branch_conditions is null and label is null
  limit 1;

  if v_outgoing_edge.id is not null then
    update public.automation_step_edges
    set to_step_id = v_outgoing_edge.to_step_id
    where to_step_id = old.id
      and id <> v_outgoing_edge.id;
  end if;

  return old;
end;
$function$;
