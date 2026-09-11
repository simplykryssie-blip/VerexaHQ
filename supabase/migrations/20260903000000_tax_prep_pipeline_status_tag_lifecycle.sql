-- Status tags (as opposed to permanent service-label tags like "2027
-- Individual/Sched C Tax Prep", which are never touched here) should
-- reflect where a lead currently sits, not pile up as it moves on. This
-- adds status tags to Ready for Prep and Needs ERO Review to match Missing
-- Info's existing pattern, and makes sure every status tag gets taken back
-- off once it's no longer true.

-- ============================================================
-- 1. Missing Info: clean slate on a fresh entry into this stage, in case a
--    lead cycles through Missing Docs more than once and still carries a
--    stale "No Response" or "Resolved" tag from a prior round.
-- ============================================================
insert into public.automation_steps (id, automation_id, display_order, action_type, display_name, action_config)
values
  ('e1a2b3c4-1111-4aaa-8bbb-cccc11112222', 'a761af2b-d421-47c7-a392-64d3e7641e24', 22, 'remove_tag', 'Remove stale tag: Missing Docs - No Response', '{"tag": "Missing Docs - No Response"}'::jsonb),
  ('e1a2b3c4-2222-4aaa-8bbb-cccc11112222', 'a761af2b-d421-47c7-a392-64d3e7641e24', 23, 'remove_tag', 'Remove stale tag: Missing Docs - Resolved', '{"tag": "Missing Docs - Resolved"}'::jsonb);

insert into public.automation_step_edges (automation_id, from_step_id, to_step_id, branch_conditions, label, sort_order)
values
  ('a761af2b-d421-47c7-a392-64d3e7641e24', 'e1a2b3c4-1111-4aaa-8bbb-cccc11112222', 'e1a2b3c4-2222-4aaa-8bbb-cccc11112222', null, null, 0),
  ('a761af2b-d421-47c7-a392-64d3e7641e24', 'e1a2b3c4-2222-4aaa-8bbb-cccc11112222', 'bbe5d8a3-856b-4659-bcd1-0480894cb1a5', null, null, 0);

update public.automation_steps set canvas_x = null, canvas_y = null where automation_id = 'a761af2b-d421-47c7-a392-64d3e7641e24';

-- ============================================================
-- 2. Ready for Prep: tag on entry, remove on both ways out (converted to
--    client, or quote declined/disengaged). Also clears any leftover
--    Missing Docs status tags on the way to becoming a real client, since
--    those no longer describe a converted client.
-- ============================================================
insert into public.automation_steps (id, automation_id, display_order, action_type, display_name, action_config)
values
  ('f2b3c4d5-0001-4bbb-8ccc-dddd22223333', '78d3fe51-8f1e-4093-b80b-8bdc509c3fb3', 20, 'add_tag', 'Tag: Ready for Prep', '{"tag": "Ready for Prep"}'::jsonb),
  ('f2b3c4d5-0002-4bbb-8ccc-dddd22223333', '78d3fe51-8f1e-4093-b80b-8bdc509c3fb3', 21, 'remove_tag', 'Remove tag: Ready for Prep', '{"tag": "Ready for Prep"}'::jsonb),
  ('f2b3c4d5-0003-4bbb-8ccc-dddd22223333', '78d3fe51-8f1e-4093-b80b-8bdc509c3fb3', 22, 'remove_tag', 'Remove stale tag: Missing Docs - Resolved', '{"tag": "Missing Docs - Resolved"}'::jsonb),
  ('f2b3c4d5-0004-4bbb-8ccc-dddd22223333', '78d3fe51-8f1e-4093-b80b-8bdc509c3fb3', 23, 'remove_tag', 'Remove stale tag: Missing Docs - No Response', '{"tag": "Missing Docs - No Response"}'::jsonb),
  ('f2b3c4d5-0005-4bbb-8ccc-dddd22223333', '78d3fe51-8f1e-4093-b80b-8bdc509c3fb3', 24, 'remove_tag', 'Remove tag: Ready for Prep', '{"tag": "Ready for Prep"}'::jsonb),
  ('f2b3c4d5-0006-4bbb-8ccc-dddd22223333', '78d3fe51-8f1e-4093-b80b-8bdc509c3fb3', 25, 'remove_tag', 'Remove stale tag: Missing Docs - Resolved', '{"tag": "Missing Docs - Resolved"}'::jsonb),
  ('f2b3c4d5-0007-4bbb-8ccc-dddd22223333', '78d3fe51-8f1e-4093-b80b-8bdc509c3fb3', 26, 'remove_tag', 'Remove stale tag: Missing Docs - No Response', '{"tag": "Missing Docs - No Response"}'::jsonb);

-- New entry point: add-tag step now runs first, then the existing chain.
insert into public.automation_step_edges (automation_id, from_step_id, to_step_id, branch_conditions, label, sort_order)
values ('78d3fe51-8f1e-4093-b80b-8bdc509c3fb3', 'f2b3c4d5-0001-4bbb-8ccc-dddd22223333', 'd88f6e7b-6067-4691-a2ae-94a8a7091f49', null, null, 0);

-- Success path: both edges that used to go straight to convert_lead_to_client
-- now run the cleanup chain first.
update public.automation_step_edges set to_step_id = 'f2b3c4d5-0002-4bbb-8ccc-dddd22223333' where id = '0dd136ad-4fa6-484b-a835-12a1d851297a';
update public.automation_step_edges set to_step_id = 'f2b3c4d5-0002-4bbb-8ccc-dddd22223333' where id = 'f9a9210d-4cf3-4315-8eb6-bd8a74d98590';

insert into public.automation_step_edges (automation_id, from_step_id, to_step_id, branch_conditions, label, sort_order)
values
  ('78d3fe51-8f1e-4093-b80b-8bdc509c3fb3', 'f2b3c4d5-0002-4bbb-8ccc-dddd22223333', 'f2b3c4d5-0003-4bbb-8ccc-dddd22223333', null, null, 0),
  ('78d3fe51-8f1e-4093-b80b-8bdc509c3fb3', 'f2b3c4d5-0003-4bbb-8ccc-dddd22223333', 'f2b3c4d5-0004-4bbb-8ccc-dddd22223333', null, null, 0),
  ('78d3fe51-8f1e-4093-b80b-8bdc509c3fb3', 'f2b3c4d5-0004-4bbb-8ccc-dddd22223333', '82ba97e1-1a2f-4eee-a646-175282419813', null, null, 0);

-- Declined path: disengage email now runs its own cleanup chain after.
insert into public.automation_step_edges (automation_id, from_step_id, to_step_id, branch_conditions, label, sort_order)
values
  ('78d3fe51-8f1e-4093-b80b-8bdc509c3fb3', '69b2107e-dc9f-44b0-b8f7-d16ed4325759', 'f2b3c4d5-0005-4bbb-8ccc-dddd22223333', null, null, 0),
  ('78d3fe51-8f1e-4093-b80b-8bdc509c3fb3', 'f2b3c4d5-0005-4bbb-8ccc-dddd22223333', 'f2b3c4d5-0006-4bbb-8ccc-dddd22223333', null, null, 0),
  ('78d3fe51-8f1e-4093-b80b-8bdc509c3fb3', 'f2b3c4d5-0006-4bbb-8ccc-dddd22223333', 'f2b3c4d5-0007-4bbb-8ccc-dddd22223333', null, null, 0);

update public.automation_steps set canvas_x = null, canvas_y = null where automation_id = '78d3fe51-8f1e-4093-b80b-8bdc509c3fb3';

-- ============================================================
-- 3. Needs ERO Review: tag on entry. No removal wired yet -- there's no
--    "ERO finished, handing back to the VA" step built in this automation
--    yet, so there's nowhere correct to take the tag off. Add that removal
--    when that hand-back step gets built.
-- ============================================================
insert into public.automation_steps (id, automation_id, display_order, action_type, display_name, action_config)
values ('a3c4d5e6-0001-4ccc-8ddd-eeee33334444', 'cd13bdc6-6da0-4eef-9671-4dff1c522ffa', 3, 'add_tag', 'Tag: Needs ERO Review', '{"tag": "Needs ERO Review"}'::jsonb);

insert into public.automation_step_edges (automation_id, from_step_id, to_step_id, branch_conditions, label, sort_order)
values ('cd13bdc6-6da0-4eef-9671-4dff1c522ffa', 'a3c4d5e6-0001-4ccc-8ddd-eeee33334444', 'ef25a540-87d5-4369-af12-80f90ac91edd', null, null, 0);

update public.automation_steps set canvas_x = null, canvas_y = null where automation_id = 'cd13bdc6-6da0-4eef-9671-4dff1c522ffa';
