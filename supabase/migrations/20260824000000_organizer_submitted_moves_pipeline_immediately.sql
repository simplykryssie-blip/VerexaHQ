-- Shanti completed her organizer overnight but didn't move in the pipeline
-- until "New Leads Enter CRM"'s 24h delay step finally elapsed and polled
-- her organizer_status. That automation only ever checks organizer status
-- when a delay timer fires -- never on the actual submission event -- so an
-- early submission just sits unnoticed until the next scheduled poll.
--
-- The engine already has a real event trigger for this (organizer.submitted)
-- and an automation already built for exactly this reaction ("Organizer
-- Completed Follow-up": notify staff, move to the service-matched pipeline,
-- escalate if no staff follow-up in 1 business day) -- it was just left
-- disabled and wired to the wrong trigger type. Fixes it to fire instantly
-- on submission, and rewires "New Leads Enter CRM"'s own poll-driven
-- notify+move (now redundant and a source of double pipeline advances) to
-- skip straight to its post-notification wait instead.

-- 1. organizer.submitted automations were only matchable by one exact
--    organizer_template_id, which would have meant five near-duplicate
--    copies of this automation (one per basic service's organizer). A
--    blank/unset organizer_template_id in trigger_config now means "any
--    organizer for this workspace" instead.
create or replace function public.fire_organizer_submitted_automations()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_automation record;
  v_context jsonb;
  v_run_id uuid;
  v_engagement_id uuid;
begin
  if not (
    (TG_OP = 'INSERT' and NEW.status in ('submitted', 'reviewed'))
    or (TG_OP = 'UPDATE' and NEW.status in ('submitted', 'reviewed') and OLD.status is distinct from NEW.status)
  ) then
    return NEW;
  end if;

  v_engagement_id := NEW.engagement_id;
  if v_engagement_id is null then
    select id into v_engagement_id from public.engagements
    where client_id = NEW.client_id and status not in ('Completed', 'Archived')
    order by created_at desc limit 1;
  end if;

  if NEW.status = 'submitted' then
    perform public._notify_admins_of_organizer_submitted(NEW.workspace_id, NEW.client_id, NEW.id, NEW.organizer_template_id);
  end if;

  v_context := jsonb_build_object('organizer_template_id', NEW.organizer_template_id, 'status', NEW.status, 'response_id', NEW.id);

  for v_automation in
    select * from public.automations
    where workspace_id = NEW.workspace_id
      and is_enabled = true
      and status = 'published'
      and trigger_type = 'organizer.submitted'
      and (
        nullif(trigger_config ->> 'organizer_template_id', '') is null
        or trigger_config ->> 'organizer_template_id' = NEW.organizer_template_id::text
      )
  loop
    if public.evaluate_automation_conditions(v_automation.conditions, v_context, NEW.workspace_id, NEW.client_id, v_engagement_id) then
      insert into public.automation_runs (workspace_id, automation_id, engagement_id, client_id, trigger_snapshot, status)
      values (NEW.workspace_id, v_automation.id, v_engagement_id, NEW.client_id, v_context, 'running')
      returning id into v_run_id;

      perform public.start_next_automation_step(v_run_id);
    end if;
  end loop;

  return NEW;
end;
$function$;

revoke all on function public.fire_organizer_submitted_automations() from public, anon, authenticated;

-- 2. Turn on "Organizer Completed Follow-up" against the real event, for
--    any organizer (trigger_config left empty).
update public.automations
set trigger_type = 'organizer.submitted',
    trigger_config = '{}'::jsonb,
    is_enabled = true
where id = 'a1cedcb0-6e33-4ed0-9a5e-322684f9b7d2';

-- 3. "New Leads Enter CRM"'s own notify+change_stage (now redundant --
--    the automation above does it instantly instead) is rewired out of the
--    graph: every branch that detects "already submitted" now skips
--    straight to the 24h-before-follow-up-appointment wait.
update public.automation_step_edges
set to_step_id = 'd5f7e2f1-b058-477d-ac77-9a2d24368625'
where id in ('f1188b2b-bc8c-4404-8008-22f774fc996f', '9353d5ed-bcef-4c93-85c9-53441da96763', 'ec4cbd40-fffb-4d52-94ab-ce0bb7556a33')
  and automation_id = 'f0cf2f59-df2f-438d-b501-9d0c535f0e5b';

-- 4. Delete the now-unreachable steps (their own outgoing edges cascade
--    with them).
delete from public.automation_steps
where id in ('8e22c64a-7516-4f12-b82f-29b68a3697c9', 'b48bec1b-90a9-437b-824a-c6c045c312ca')
  and automation_id = 'f0cf2f59-df2f-438d-b501-9d0c535f0e5b';
