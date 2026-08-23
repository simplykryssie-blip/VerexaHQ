-- Reverses the single branching intake automation: the owner wants a
-- separate automation per service instead of one automation branching
-- internally by client.service_id. Drops "New Lead Intake -- All
-- Services" (zero real runs against it -- only rolled-back test
-- transactions -- so this is a clean delete, cascades to its steps/edges)
-- and replaces it with 9 linear, single-service automations.
--
-- Each new automation still triggers on client.service_interest_selected,
-- but scopes itself with trigger_config->>'service_id' instead of an
-- internal condition step -- fire_service_interest_automations() already
-- filters candidate automations by
-- "trigger_config->>'service_id' = NEW.service_id::text" before even
-- evaluating conditions, so this is the intended mechanism for a
-- single-service automation, not a workaround.
--
-- Each automation: assign staff round-robin -> send the welcome email ->
-- push that service's auto-detected organizer (send_organizer_template's
-- {}-config already resolves the right template from
-- services.organizer_template_id -- still nothing hardcoded to one
-- organizer) or, for services without organizer content yet, create a
-- staff follow-up task.

do $$
declare
  v_workspace_id uuid := '74321fb2-9a18-4625-ab12-01c98e888667';
  v_old_automation_id uuid;
  v_svc record;
  v_automation_id uuid;
  v_assign_step_id uuid;
  v_email_step_id uuid;
  v_final_step_id uuid;
begin
  select id into v_old_automation_id from public.automations where slug = 'new-lead-intake-all-services' and workspace_id = v_workspace_id;
  if v_old_automation_id is not null then
    delete from public.automations where id = v_old_automation_id;
  end if;

  for v_svc in
    select id, name, slug, requires_organizer from public.services where workspace_id = v_workspace_id order by name
  loop
    insert into public.automations (workspace_id, name, slug, description, trigger_type, trigger_config, conditions, is_enabled, status)
    values (
      v_workspace_id, 'New Lead Intake -- ' || v_svc.name, 'new-lead-intake-' || v_svc.slug,
      'Runs when a lead selects ' || v_svc.name || ': assigns staff, sends the welcome email, and ' ||
      (case when v_svc.requires_organizer then 'sends this service''s organizer.' else 'creates a staff follow-up task.' end),
      'client.service_interest_selected', jsonb_build_object('service_id', v_svc.id), '[]'::jsonb, true, 'published'
    )
    returning id into v_automation_id;

    insert into public.automation_steps (id, automation_id, display_order, action_type, action_config)
    values (gen_random_uuid(), v_automation_id, 0, 'assign_user', jsonb_build_object('target', 'client', 'assignment_mode', 'round_robin'))
    returning id into v_assign_step_id;

    insert into public.automation_steps (id, automation_id, display_order, action_type, action_config)
    values (gen_random_uuid(), v_automation_id, 1, 'send_email', jsonb_build_object('template_slug', 'lead-welcome-email'))
    returning id into v_email_step_id;

    insert into public.automation_step_edges (automation_id, from_step_id, to_step_id, sort_order)
    values (v_automation_id, v_assign_step_id, v_email_step_id, 0);

    if v_svc.requires_organizer then
      insert into public.automation_steps (id, automation_id, display_order, action_type, action_config)
      values (gen_random_uuid(), v_automation_id, 2, 'send_organizer_template', '{}'::jsonb)
      returning id into v_final_step_id;
    else
      insert into public.automation_steps (id, automation_id, display_order, action_type, action_config)
      values (
        gen_random_uuid(), v_automation_id, 2, 'create_task',
        jsonb_build_object(
          'title', v_svc.name || ' -- schedule intake/kickoff call',
          'description', 'New lead selected ' || v_svc.name || '. Reach out to schedule a discovery/kickoff call.',
          'due_in_days', 1, 'priority', 'high'
        )
      )
      returning id into v_final_step_id;
    end if;

    insert into public.automation_step_edges (automation_id, from_step_id, to_step_id, sort_order)
    values (v_automation_id, v_email_step_id, v_final_step_id, 0);
  end loop;
end $$;
