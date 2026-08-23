-- One branching intake automation instead of 8-9 separate ones, per the
-- workspace owner's explicit direction. Triggers on
-- client.service_interest_selected (not lead.created) because
-- fire_service_interest_automations()'s trigger_snapshot carries
-- service_id directly and only fires once the client_service_interests
-- row exists -- lead.created can fire before that row exists, which
-- would break the client.service_id branch condition below.
--
-- Each of the 9 services gets its own branch off a single condition step:
-- assign staff round-robin, send the welcome email, then either push that
-- service's auto-detected organizer (send_organizer_template already
-- resolves the right template from services.organizer_template_id --
-- nothing is hardcoded to one organizer) or, for the 5 services that
-- don't have organizer content yet, create a staff follow-up task
-- instead of fabricating one. A final catch-all branch (NULL
-- branch_conditions, highest sort_order so it never short-circuits a
-- real branch) covers a lead with no matched service on file.

do $$
declare
  v_workspace_id uuid := '74321fb2-9a18-4625-ab12-01c98e888667';
  v_automation_id uuid;
  v_condition_step_id uuid;
  v_default_assign_step_id uuid;
  v_default_task_step_id uuid;
  v_svc record;
  v_assign_step_id uuid;
  v_email_step_id uuid;
  v_final_step_id uuid;
  v_sort_order int := 0;
  v_display_order int := 1;
begin
  insert into public.automations (workspace_id, name, slug, description, trigger_type, trigger_config, conditions, is_enabled, status)
  values (
    v_workspace_id, 'New Lead Intake -- All Services', 'new-lead-intake-all-services',
    'Branches by the service a lead selected at signup; assigns staff, sends the welcome email, and either pushes that service''s organizer or creates a staff follow-up task.',
    'client.service_interest_selected', '{}'::jsonb, '[]'::jsonb, true, 'published'
  )
  returning id into v_automation_id;

  insert into public.automation_steps (id, automation_id, display_order, action_type, action_config)
  values (gen_random_uuid(), v_automation_id, 0, 'condition', '{}'::jsonb)
  returning id into v_condition_step_id;

  for v_svc in
    select id, name, requires_organizer from public.services where workspace_id = v_workspace_id order by name
  loop
    v_display_order := v_display_order + 1;
    insert into public.automation_steps (id, automation_id, display_order, action_type, action_config)
    values (gen_random_uuid(), v_automation_id, v_display_order, 'assign_user', jsonb_build_object('target', 'client', 'assignment_mode', 'round_robin'))
    returning id into v_assign_step_id;

    insert into public.automation_step_edges (automation_id, from_step_id, to_step_id, branch_conditions, label, sort_order)
    values (
      v_automation_id, v_condition_step_id, v_assign_step_id,
      jsonb_build_array(jsonb_build_object('conditions', jsonb_build_array(jsonb_build_object('field', 'client.service_id', 'op', 'eq', 'value', v_svc.id::text)))),
      v_svc.name, v_sort_order
    );
    v_sort_order := v_sort_order + 1;

    v_display_order := v_display_order + 1;
    insert into public.automation_steps (id, automation_id, display_order, action_type, action_config)
    values (gen_random_uuid(), v_automation_id, v_display_order, 'send_email', jsonb_build_object('template_slug', 'lead-welcome-email'))
    returning id into v_email_step_id;

    insert into public.automation_step_edges (automation_id, from_step_id, to_step_id, sort_order)
    values (v_automation_id, v_assign_step_id, v_email_step_id, 0);

    v_display_order := v_display_order + 1;
    if v_svc.requires_organizer then
      insert into public.automation_steps (id, automation_id, display_order, action_type, action_config)
      values (gen_random_uuid(), v_automation_id, v_display_order, 'send_organizer_template', '{}'::jsonb)
      returning id into v_final_step_id;
    else
      insert into public.automation_steps (id, automation_id, display_order, action_type, action_config)
      values (
        gen_random_uuid(), v_automation_id, v_display_order, 'create_task',
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

  v_display_order := v_display_order + 1;
  insert into public.automation_steps (id, automation_id, display_order, action_type, action_config)
  values (gen_random_uuid(), v_automation_id, v_display_order, 'assign_user', jsonb_build_object('target', 'client', 'assignment_mode', 'round_robin'))
  returning id into v_default_assign_step_id;

  insert into public.automation_step_edges (automation_id, from_step_id, to_step_id, branch_conditions, label, sort_order)
  values (v_automation_id, v_condition_step_id, v_default_assign_step_id, null, 'No service matched', v_sort_order);

  v_display_order := v_display_order + 1;
  insert into public.automation_steps (id, automation_id, display_order, action_type, action_config)
  values (
    gen_random_uuid(), v_automation_id, v_display_order, 'create_task',
    jsonb_build_object('title', 'New lead -- confirm what they need', 'description', 'This lead had no matched service on file. Reach out to confirm what they''re looking for.', 'due_in_days', 1, 'priority', 'high')
  )
  returning id into v_default_task_step_id;

  insert into public.automation_step_edges (automation_id, from_step_id, to_step_id, sort_order)
  values (v_automation_id, v_default_assign_step_id, v_default_task_step_id, 0);
end $$;
