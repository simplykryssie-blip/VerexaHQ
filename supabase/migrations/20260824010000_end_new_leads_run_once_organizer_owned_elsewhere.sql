-- Follow-up to 20260824000000: once "Organizer Completed Follow-up" owns
-- the immediate post-submission reaction, "New Leads Enter CRM" has
-- nothing left to do for a client who's already submitted except idle out
-- its own leftover 24h timer -- which is exactly what left Shanti's run
-- looking permanently "stuck" on a wait bubble even after she'd already
-- been moved and notified via the other automation. Ends that run cleanly
-- the moment submission is detected instead, and moves the one piece of
-- real follow-up work it still owned (create a staff task to schedule the
-- intake review call) onto "Organizer Completed Follow-up" so nothing is
-- lost.

do $$
declare
  v_end_step_id uuid;
  v_task_step_id uuid;
begin
  -- 1. New Leads Enter CRM: add an end_workflow step and point every
  --    "already submitted" branch at it instead of the now-orphaned
  --    wait-then-create-task tail.
  insert into public.automation_steps (automation_id, display_order, action_type, action_config, canvas_x, canvas_y)
  values ('f0cf2f59-df2f-438d-b501-9d0c535f0e5b', 25, 'end_workflow', '{}'::jsonb, 550, 980)
  returning id into v_end_step_id;

  update public.automation_step_edges
  set to_step_id = v_end_step_id
  where id in ('f1188b2b-bc8c-4404-8008-22f774fc996f', '9353d5ed-bcef-4c93-85c9-53441da96763', 'ec4cbd40-fffb-4d52-94ab-ce0bb7556a33')
    and automation_id = 'f0cf2f59-df2f-438d-b501-9d0c535f0e5b';

  delete from public.automation_steps
  where id in ('d5f7e2f1-b058-477d-ac77-9a2d24368625', 'c3f99195-2be3-4f08-b185-2e6b258b41d0')
    and automation_id = 'f0cf2f59-df2f-438d-b501-9d0c535f0e5b';

  -- 2. Organizer Completed Follow-up: splice the same "Schedule Intake
  --    Review Call" task in right after the pipeline move, before the
  --    escalation wait.
  insert into public.automation_steps (automation_id, display_order, action_type, action_config, canvas_x, canvas_y)
  values (
    'a1cedcb0-6e33-4ed0-9a5e-322684f9b7d2', 6, 'create_task',
    jsonb_build_object(
      'title', 'Schedule Intake Review Call',
      'priority', 'high',
      'description', E'Schedule consultation\nReview organizer before consultation\nConduct consultation\nConfirm services and scope\nFinalize quote\nSend quote\nRecord quote decision',
      'due_in_days', '.5'
    ),
    300, 235
  )
  returning id into v_task_step_id;

  update public.automation_step_edges
  set to_step_id = v_task_step_id
  where id = '01165f4b-afdd-4f4e-9f5d-2248a50dc6cf';

  insert into public.automation_step_edges (automation_id, from_step_id, to_step_id, sort_order)
  values ('a1cedcb0-6e33-4ed0-9a5e-322684f9b7d2', v_task_step_id, '28bf547e-7d1f-4220-82b5-0f5deb4f7bdc', 0);
end $$;
