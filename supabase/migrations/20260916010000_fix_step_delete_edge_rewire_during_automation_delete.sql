-- sync_automation_step_edges() (BEFORE DELETE on automation_steps) rewires
-- the single plain upstream/downstream edge around a deleted step so
-- A -> [deleted] -> B becomes A -> B. That's correct and necessary for
-- deleting one step out of a still-live automation, but it also fires for
-- every row when the whole automation is deleted (automations -> DELETE
-- CASCADE -> automation_steps), and in that case it can reference a step
-- already removed earlier in the same cascading delete: its own SELECT
-- into v_outgoing_edge captures a to_step_id that's still valid at read
-- time, but by the time the subsequent UPDATE runs, Postgres's per-row
-- cascade/trigger interleaving for this multi-row DELETE can have already
-- removed that target step, so the UPDATE writes a to_step_id that's no
-- longer present -- "insert or update on table automation_step_edges
-- violates foreign key constraint automation_step_edges_to_step_id_fkey" --
-- which aborts the whole automation delete. Reproduced directly against
-- "1. New Tax Service Lead Enters CRM" (640a30e7-ddb8-4897-9c9e-d8c475cc38ab)
-- in a rolled-back transaction.
--
-- Rewiring is pointless anyway when the automation itself won't survive --
-- every step and edge is about to be gone. Skip the whole function body
-- whenever the parent automation row is already gone, which is always true
-- for every row in this cascade (the automations row delete is what
-- triggered the nested "DELETE FROM automation_steps" in the first place).
-- A normal single-step delete, where the automation still exists, is
-- completely unaffected.

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
  if not exists (select 1 from public.automations where id = old.automation_id) then
    return old;
  end if;

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
