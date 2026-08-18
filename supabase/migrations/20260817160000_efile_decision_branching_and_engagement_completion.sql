-- advance_workflow_on_stage_completed() always walked stages strictly by
-- display_order, so a completed "Filed / Awaiting Acceptance" stage always
-- advanced into "Rejected / Correction Needed" next -- regardless of
-- whether the return was actually accepted. There was no branching
-- mechanism at all, automated or manual. This teaches the function one
-- narrow special case: when the stage that just completed is named
-- "Filed / Awaiting Acceptance" and engagement_tax_details.efile_status
-- has been recorded as 'accepted' (set by EfileDecisionActions.tsx before
-- it marks the stage Completed), skip "Rejected / Correction Needed" by
-- marking it Skipped so the normal next-stage search passes over it.
--
-- Separately, a workflow reaching its last stage marked workflow_runs
-- Completed but never told the engagement itself -- engagements.status
-- stayed "New" forever with no completed_date, so any report or list
-- filtered on engagement status would never recognize the job as done.
-- This adds that sync alongside the existing workflow_runs update.

create or replace function public.advance_workflow_on_stage_completed()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_next_stage_id uuid;
  v_engagement_id uuid;
  v_efile_status text;
begin
  select engagement_id into v_engagement_id
  from workflow_runs
  where id = new.workflow_run_id;

  if new.status = 'Completed' and new.stage_name = 'Filed / Awaiting Acceptance' then
    select efile_status into v_efile_status
    from engagement_tax_details
    where engagement_id = v_engagement_id;

    if v_efile_status = 'accepted' then
      update workflow_stages
      set status = 'Skipped'
      where workflow_run_id = new.workflow_run_id
        and stage_name = 'Rejected / Correction Needed'
        and status not in ('Completed', 'Skipped');
    end if;
  end if;

  select id into v_next_stage_id
  from workflow_stages
  where workflow_run_id = new.workflow_run_id
    and display_order > new.display_order
    and status not in ('Completed', 'Skipped')
  order by display_order asc
  limit 1;

  if v_next_stage_id is not null then
    update workflow_runs
    set current_stage_id = v_next_stage_id
    where id = new.workflow_run_id;

    update workflow_stages
    set status = 'In Progress', started_at = now()
    where id = v_next_stage_id;
  else
    update workflow_runs
    set status = 'Completed', completed_at = now()
    where id = new.workflow_run_id;

    update engagements
    set status = 'Completed', completed_date = now()
    where id = v_engagement_id;
  end if;

  return new;
end;
$function$;
