-- sync_automation_step_edges() previously fired on every INSERT/UPDATE/DELETE
-- of any automation_steps row, and whenever the automation had NO condition
-- step at that moment, wiped *every* plain edge for the whole automation and
-- rebuilt a fresh straight-line chain purely from display_order. That meant:
--   - deleting the automation's last remaining condition step (its own
--     branches already correctly removed by the from_step_id FK cascade)
--     would then also silently reflow every *other*, unrelated step's
--     connections in the same automation into a brand-new display_order
--     chain, discarding whatever wiring was actually there;
--   - the same wipe-and-rebuild ran again on every plain config save
--     (WorkflowBuilder's "Save step") for any automation with no condition
--     step, and on every step insert, duplicating edges the frontend
--     (addStep/onConnect) already wires up itself.
-- Replaced with a narrowly-scoped BEFORE DELETE trigger that only ever
-- reconnects the single upstream/downstream *plain* (unlabeled,
-- condition-less) edge immediately around the one step being deleted --
-- e.g. A -> [deleted] -> B becomes A -> B -- and does nothing at all when
-- the deleted step is itself a condition (its branches are already handled
-- by the existing FK cascades: from_step_id cascades, to_step_id sets
-- null so a branch pointing *at* the deleted step keeps its label/
-- conditions and just shows as "not connected yet"). A real branch edge
-- (anything with a label or branch_conditions set) is never touched.

drop trigger if exists automation_steps_sync_edges on public.automation_steps;

create or replace function public.sync_automation_step_edges()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_incoming_edge public.automation_step_edges%rowtype;
  v_outgoing_edge public.automation_step_edges%rowtype;
begin
  if old.action_type = 'condition' then
    return old;
  end if;

  select * into v_incoming_edge
  from public.automation_step_edges
  where to_step_id = old.id and branch_conditions is null and label is null
  limit 1;

  select * into v_outgoing_edge
  from public.automation_step_edges
  where from_step_id = old.id and branch_conditions is null and label is null
  limit 1;

  if v_incoming_edge.id is not null and v_outgoing_edge.id is not null then
    update public.automation_step_edges
    set to_step_id = v_outgoing_edge.to_step_id
    where id = v_incoming_edge.id;
  end if;

  return old;
end;
$function$;

create trigger automation_steps_sync_edges
  before delete on public.automation_steps
  for each row execute function public.sync_automation_step_edges();
