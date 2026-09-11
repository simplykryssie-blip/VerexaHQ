-- The "Missing Info" reminder chain's 4 check-in points each only had one
-- outgoing branch ("still missing -> send next reminder"). There was no
-- explicit "no, docs are in / staff already moved this lead out of Missing
-- Docs" branch -- when that case happened the run just silently stopped
-- (an unlabeled dead end), and there was no staff notification anywhere in
-- the whole automation. This gives every check-in a real Yes/No pair and
-- adds the missing staff notification right before the lead gets
-- disengaged.

-- 1. Two new steps: a staff notification right before disengagement, and a
--    shared "resolved" tag every condition's No branch lands on.
insert into public.automation_steps (id, automation_id, display_order, action_type, display_name, action_config)
values
  ('de9f9c11-cf5f-4c33-8e6f-2a1a7c9b1e40', 'a761af2b-d421-47c7-a392-64d3e7641e24', 16,
   'send_notification', 'Notify staff: Lead being disengaged',
   '{"message": "{{client_name}} has not responded to 3 document reminders over 10 days and is being disengaged from Individual Tax Prep.", "channels": ["In-App", "Email"]}'::jsonb),
  ('4f6a0c39-4b7e-4e2b-9a4e-8b1d6e2c5a7f', 'a761af2b-d421-47c7-a392-64d3e7641e24', 17,
   'add_tag', 'Tag: Missing Docs - Resolved',
   '{"tag": "Missing Docs - Resolved"}'::jsonb);

-- 2. Splice the staff notification into the existing exhausted path: last
--    condition's Yes edge now goes to the notification first, then into the
--    same add_tag/mark_lead_lost/move_pipeline_stage chain as before.
update public.automation_step_edges
set to_step_id = 'de9f9c11-cf5f-4c33-8e6f-2a1a7c9b1e40', label = 'Yes - still missing'
where id = '9ba30040-c678-4a84-aad7-ce64c8bbf3b0';

insert into public.automation_step_edges (automation_id, from_step_id, to_step_id, branch_conditions, label, sort_order)
values ('a761af2b-d421-47c7-a392-64d3e7641e24', 'de9f9c11-cf5f-4c33-8e6f-2a1a7c9b1e40', '1a33abbe-bac6-43ff-8d6d-663692dc395a', null, null, 0);

-- 3. Relabel the other 3 existing Yes edges to match the new Yes/No pairing.
update public.automation_step_edges
set label = 'Yes - still missing'
where id in ('be7deda1-4860-45f4-b2ce-f0ae2e82300d', '57a1ae2c-33a4-4532-97d8-2a6bb90eb4e8', '79dbce39-621d-4ad7-8a4a-5bde33959211');

-- 4. Give every condition step its explicit No branch -- docs already came
--    in, or staff manually moved the lead out of Missing Docs -- all
--    converging on the shared "resolved" tag so the reminder chain stops
--    cleanly and visibly instead of silently dead-ending.
insert into public.automation_step_edges (automation_id, from_step_id, to_step_id, branch_conditions, label, sort_order)
values
  ('a761af2b-d421-47c7-a392-64d3e7641e24', 'ba608fb6-2de8-4565-b11e-934a2c104262', '4f6a0c39-4b7e-4e2b-9a4e-8b1d6e2c5a7f',
   '[{"conditions":[{"field":"lead.process_stage_id","op":"neq","value":"f73e3103-181c-4201-8f0c-2eee042c2209"}]}]'::jsonb, 'No - docs received', 1),
  ('a761af2b-d421-47c7-a392-64d3e7641e24', 'cdd0b6aa-2cee-4bfd-bdf7-3a61258d95b8', '4f6a0c39-4b7e-4e2b-9a4e-8b1d6e2c5a7f',
   '[{"conditions":[{"field":"lead.process_stage_id","op":"neq","value":"f73e3103-181c-4201-8f0c-2eee042c2209"}]}]'::jsonb, 'No - docs received', 1),
  ('a761af2b-d421-47c7-a392-64d3e7641e24', '1d815487-b548-4164-a8c5-8d7212a7979e', '4f6a0c39-4b7e-4e2b-9a4e-8b1d6e2c5a7f',
   '[{"conditions":[{"field":"lead.process_stage_id","op":"neq","value":"f73e3103-181c-4201-8f0c-2eee042c2209"}]}]'::jsonb, 'No - docs received', 1),
  ('a761af2b-d421-47c7-a392-64d3e7641e24', '04755e35-8253-45f6-90ed-58050421e56f', '4f6a0c39-4b7e-4e2b-9a4e-8b1d6e2c5a7f',
   '[{"conditions":[{"field":"lead.process_stage_id","op":"neq","value":"f73e3103-181c-4201-8f0c-2eee042c2209"}]}]'::jsonb, 'No - docs received', 1);
