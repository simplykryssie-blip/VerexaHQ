-- The Tax Production pipeline standup (20260816010833) left a stray
-- display_order=1 stage literally named after the process itself
-- ("1040 / Schedule C — Tax Production"), ahead of the real first stage
-- ("Engagement Opened") at order 2. Nothing has run through this pipeline
-- yet (it isn't wired to any service's process_id), so this is a pure data
-- fix, not a migration of live state.
delete from public.process_stages
where process_id = (select id from public.processes where name = '1040 / Schedule C — Tax Production')
  and name = '1040 / Schedule C — Tax Production'
  and display_order = 1;

update public.process_stages
set display_order = display_order - 1
where process_id = (select id from public.processes where name = '1040 / Schedule C — Tax Production');
