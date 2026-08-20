-- Phase 1 of the canvas automation builder (branching): the graph data
-- model, additive only. Nothing here changes how any existing automation
-- runs -- start_next_automation_step still uses display_order until a
-- separate follow-up migration cuts it over to traverse these edges.

-- Allow a step to be a pure routing/branch node, not just a side-effecting action.
alter table public.automation_steps drop constraint automation_steps_action_type_check;
alter table public.automation_steps add constraint automation_steps_action_type_check
  check (action_type = any (array['send_email','send_sms','send_notification','create_task','assign_user','change_stage','request_approval','delay','webhook','escalate','send_organizer_template','create_engagement','send_engagement_letter','send_document_request','move_lead_stage','mark_lead_lost','convert_lead_to_client','update_client','create_client','move_engagement_stage','create_quote','send_quote','add_tag','remove_tag','add_note','send_portal_message','start_workflow','end_workflow','invite_to_portal','condition']));

-- Canvas layout, unused until the React Flow UI lands (phase 2).
alter table public.automation_steps add column if not exists canvas_x numeric;
alter table public.automation_steps add column if not exists canvas_y numeric;

-- Explicit graph position for a run, replacing "infer from logs by display_order".
alter table public.automation_runs add column if not exists current_step_id uuid references public.automation_steps(id) on delete set null;

-- The graph itself. A null branch_conditions edge is unconditional (the one
-- path out of a plain action step, or the "else" out of a condition step);
-- a non-null one is only followed if evaluate_automation_conditions() passes
-- against the run's trigger_snapshot. Edges are tried in sort_order, first
-- match wins.
create table public.automation_step_edges (
  id uuid primary key default gen_random_uuid(),
  automation_id uuid not null references public.automations(id) on delete cascade,
  from_step_id uuid not null references public.automation_steps(id) on delete cascade,
  to_step_id uuid not null references public.automation_steps(id) on delete cascade,
  branch_conditions jsonb,
  label text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index automation_step_edges_from_step_id_idx on public.automation_step_edges(from_step_id);
create index automation_step_edges_to_step_id_idx on public.automation_step_edges(to_step_id);
create index automation_step_edges_automation_id_idx on public.automation_step_edges(automation_id);

alter table public.automation_step_edges enable row level security;

create policy automation_step_edges_select on public.automation_step_edges for select
using (exists (select 1 from public.automations a where a.id = automation_step_edges.automation_id and (a.workspace_id is null or public.is_workspace_member(a.workspace_id))));

create policy automation_step_edges_insert on public.automation_step_edges for insert
with check (exists (select 1 from public.automations a where a.id = automation_step_edges.automation_id and a.workspace_id is not null and public.is_workspace_admin(a.workspace_id)));

create policy automation_step_edges_update on public.automation_step_edges for update
using (exists (select 1 from public.automations a where a.id = automation_step_edges.automation_id and a.workspace_id is not null and public.is_workspace_admin(a.workspace_id)));

create policy automation_step_edges_delete on public.automation_step_edges for delete
using (exists (select 1 from public.automations a where a.id = automation_step_edges.automation_id and a.workspace_id is not null and public.is_workspace_admin(a.workspace_id)));

-- Keeps a straight-line edge chain (matching display_order) in sync for any
-- automation that's still purely linear -- i.e. every automation the
-- current list-based WorkflowBuilder.tsx can create, since it has no way to
-- add a 'condition' step. The moment an automation gets its first condition
-- step (only possible via direct DB access until phase 2's canvas ships),
-- this backs off entirely and leaves that automation's edges alone -- they
-- become canvas/hand-managed from then on.
create or replace function public.sync_automation_step_edges()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_automation_id uuid;
  v_has_condition boolean;
begin
  v_automation_id := coalesce(new.automation_id, old.automation_id);

  select exists(select 1 from public.automation_steps where automation_id = v_automation_id and action_type = 'condition')
  into v_has_condition;

  if v_has_condition then
    return coalesce(new, old);
  end if;

  delete from public.automation_step_edges where automation_id = v_automation_id and branch_conditions is null and label is null;

  insert into public.automation_step_edges (automation_id, from_step_id, to_step_id, sort_order)
  select v_automation_id, s1.id, s2.id, 0
  from (
    select id, row_number() over (order by display_order) as rn
    from public.automation_steps where automation_id = v_automation_id
  ) s1
  join (
    select id, row_number() over (order by display_order) as rn
    from public.automation_steps where automation_id = v_automation_id
  ) s2 on s2.rn = s1.rn + 1;

  return coalesce(new, old);
end;
$function$;

create trigger automation_steps_sync_edges
after insert or update or delete on public.automation_steps
for each row execute function public.sync_automation_step_edges();

-- One-time backfill: touch one step per existing automation to fire the new
-- trigger and populate its straight-line edges.
update public.automation_steps
set updated_at = updated_at
where id in (select distinct on (automation_id) id from public.automation_steps order by automation_id, display_order);

-- Backfill current_step_id for any run already mid-flight, so the future
-- edge-based executor picks up exactly where display_order-based tracking
-- left off (the last step actually logged as completed for that run).
update public.automation_runs r
set current_step_id = (
  select (l.execution_data ->> 'step_id')::uuid
  from public.automation_execution_logs l
  where l.status = 'completed'
    and (l.execution_data ->> 'run_id')::uuid = r.id
  order by l.executed_at desc
  limit 1
)
where r.status = 'running' and r.current_step_id is null;
