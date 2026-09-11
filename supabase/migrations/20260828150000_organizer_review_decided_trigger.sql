-- New automation trigger: organizer_response.review_decided
--
-- Fires whenever a staff reviewer sets an organizer response's review_status
-- (via set_organizer_response_review_status) to Approved, Rejected, or
-- Corrections Requested. Mirrors the shape of
-- fire_organizer_information_request_resolved_automations(): an AFTER UPDATE
-- trigger on the column that actually changes, building a trigger_snapshot
-- context, matching automations by trigger_type + trigger_config, then
-- evaluating conditions and starting a run -- same pattern, different column.
create or replace function public.fire_organizer_response_review_decided_automations()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_automation record;
  v_context jsonb;
  v_run_id uuid;
begin
  if new.review_status is null or new.review_status is not distinct from old.review_status then
    return new;
  end if;

  v_context := jsonb_build_object(
    'organizer_template_id', new.organizer_template_id,
    'organizer_response_id', new.id,
    'review_status', new.review_status::text,
    'review_note', new.review_note
  );

  for v_automation in
    select * from public.automations
    where workspace_id = new.workspace_id and is_enabled = true and status = 'published'
      and trigger_type = 'organizer_response.review_decided'
      and trigger_config ->> 'to_status' = new.review_status::text
      and (
        nullif(trigger_config ->> 'organizer_template_id', '') is null
        or trigger_config ->> 'organizer_template_id' = new.organizer_template_id::text
      )
  loop
    if public.evaluate_automation_conditions(v_automation.conditions, v_context, new.workspace_id, new.client_id, new.engagement_id) then
      insert into public.automation_runs (workspace_id, automation_id, engagement_id, client_id, trigger_snapshot, status)
      values (new.workspace_id, v_automation.id, new.engagement_id, new.client_id, v_context, 'running')
      returning id into v_run_id;
      perform public.start_next_automation_step(v_run_id);
    end if;
  end loop;

  return new;
end;
$$;

create trigger trg_fire_organizer_response_review_decided_automations
  after update of review_status on public.organizer_responses
  for each row execute function public.fire_organizer_response_review_decided_automations();
