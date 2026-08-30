-- 1. Generalize the existing "Quote Rejection" disengagement email into a
--    universal one, reused across every disengagement path instead of
--    building a near-duplicate template per scenario. Slug stays the same
--    since the Ready-for-Prep automation's quote-declined step already
--    references it by slug.
update public.email_templates
set name = 'Disengagement Notice (General)',
    body_html = replace(
      body_html,
      'We understand that you have decided not to move forward with the quote provided. As a result, <strong>{{firm_name}} </strong>will not be proceeding with your service at this time, and your current inquiry will be closed.',
      'We were unable to move forward with your service request at this time. As a result, <strong>{{firm_name}} </strong>will not be proceeding with your service, and your current inquiry will be closed.'
    )
where id = '2f6abd8f-ae08-4e46-910a-6a985776de8e';

-- 2. Add the missing client-facing disengagement email to the Missing Info
--    automation's exhausted path, right after the staff notice and before
--    the internal bookkeeping (tag/mark lost/move pipeline).
insert into public.automation_steps (id, automation_id, display_order, action_type, display_name, action_config)
values (
  '7c3e9a10-2f4d-4b6e-9a1c-5d8e6f3b2a90', 'a761af2b-d421-47c7-a392-64d3e7641e24', 18,
  'send_email', 'Email: Disengagement notice',
  '{"template_slug": "email_quote_rejected"}'::jsonb
);

update public.automation_step_edges
set to_step_id = '7c3e9a10-2f4d-4b6e-9a1c-5d8e6f3b2a90'
where id = '19b592f4-22ef-4647-b615-3dfc0fa2fe51';

insert into public.automation_step_edges (automation_id, from_step_id, to_step_id, branch_conditions, label, sort_order)
values ('a761af2b-d421-47c7-a392-64d3e7641e24', '7c3e9a10-2f4d-4b6e-9a1c-5d8e6f3b2a90', '1a33abbe-bac6-43ff-8d6d-663692dc395a', null, null, 0);

-- 3. The 4 condition checkpoints' No branches all pointed at ONE shared
--    "resolved" tag step. That made the canvas draw long lines from every
--    checkpoint (some far down the chain) back up to that one shared node --
--    the crossing/overlapping lines in the builder. Giving each checkpoint
--    its own resolved-tag step keeps every branch short and local instead.
insert into public.automation_steps (id, automation_id, display_order, action_type, display_name, action_config)
values
  ('b4d1f2a3-6e5c-4a8b-9d2e-1f3a7c6b5e40', 'a761af2b-d421-47c7-a392-64d3e7641e24', 19, 'add_tag', 'Tag: Missing Docs - Resolved', '{"tag": "Missing Docs - Resolved"}'::jsonb),
  ('c5e2a3b4-7f6d-4b9c-8e3f-2a4b8d7c6f51', 'a761af2b-d421-47c7-a392-64d3e7641e24', 20, 'add_tag', 'Tag: Missing Docs - Resolved', '{"tag": "Missing Docs - Resolved"}'::jsonb),
  ('d6f3b4c5-8a7e-4c1d-9f4a-3b5c9e8d7a62', 'a761af2b-d421-47c7-a392-64d3e7641e24', 21, 'add_tag', 'Tag: Missing Docs - Resolved', '{"tag": "Missing Docs - Resolved"}'::jsonb);

update public.automation_step_edges set to_step_id = 'b4d1f2a3-6e5c-4a8b-9d2e-1f3a7c6b5e40' where id = '076662ac-d152-4a9d-83c4-8f027d3b5fd4';
update public.automation_step_edges set to_step_id = 'c5e2a3b4-7f6d-4b9c-8e3f-2a4b8d7c6f51' where id = '4b9cc6ea-234b-4188-ade2-749569b40d55';
update public.automation_step_edges set to_step_id = 'd6f3b4c5-8a7e-4c1d-9f4a-3b5c9e8d7a62' where id = 'fd88055d-8326-429d-93f6-99f4cdf778a8';

-- 4. Clear every step's saved canvas position for this automation so the
--    builder recomputes a fresh layout against the now-untangled graph
--    instead of reusing the old, overlapping positions it had saved.
update public.automation_steps
set canvas_x = null, canvas_y = null
where automation_id = 'a761af2b-d421-47c7-a392-64d3e7641e24';
