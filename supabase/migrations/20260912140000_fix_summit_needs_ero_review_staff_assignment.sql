-- Same clone-leftover pattern as 20260912130000: Summit's "Individual/Sched C
-- -- Needs ERO Review" automation (id 2984be41-844d-443f-b9a4-b4688170bb52)
-- assigns the escalation to a fixed staff_id (817d1585-9c4f-448c-bc8c-b0c3e7a50904)
-- that is MKB Financial Group's real, active owner (Kryssie Shanelle) --
-- not a member of Summit's workspace at all. Both its assign_user step and
-- its create_task step used this id.
--
-- Confirmed via a platform-wide scan of assign_user/create_task/notify_staff_member
-- fixed staff_id references (checking every automation, every workspace, against
-- workspace_users) that this is the only remaining instance of this bug class.
--
-- MKB's automation assigns "needs ERO review" escalations to its own owner;
-- Summit's structural equivalent is its own owner, Monica Jones
-- (8e6130f9-31e2-44e7-9490-3d45ec06e314).
update automation_steps
set action_config = jsonb_set(action_config, '{staff_id}', '"8e6130f9-31e2-44e7-9490-3d45ec06e314"')
where automation_id = '2984be41-844d-443f-b9a4-b4688170bb52'
and action_type = 'assign_user'
and action_config ->> 'staff_id' = '817d1585-9c4f-448c-bc8c-b0c3e7a50904';

update automation_steps
set action_config = jsonb_set(action_config, '{assigned_staff_id}', '"8e6130f9-31e2-44e7-9490-3d45ec06e314"')
where automation_id = '2984be41-844d-443f-b9a4-b4688170bb52'
and action_type = 'create_task'
and action_config ->> 'assigned_staff_id' = '817d1585-9c4f-448c-bc8c-b0c3e7a50904';
