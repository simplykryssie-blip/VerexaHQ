-- New standalone "Pending Organizer" pipeline for leads who stall on
-- completing their organizer -- a holding/nurture path distinct from the
-- generic New Lead Pipeline, per the owner's design for the "New Leads
-- Enter CRM" automation's 24h-recheck branch.

do $$
declare
  v_workspace_id uuid := '74321fb2-9a18-4625-ab12-01c98e888667';
  v_process_id uuid;
  v_stage_names text[] := array['Pending Organizer', 'Reminder Sent', 'Escalated to Staff', 'Organizer Completed', 'Lost'];
  v_i int;
begin
  insert into public.processes (workspace_id, name, slug, status, created_by)
  values (v_workspace_id, 'Pending Organizer Pipeline', 'pending-organizer-pipeline', 'published', null)
  returning id into v_process_id;

  for v_i in 1 .. array_length(v_stage_names, 1) loop
    insert into public.process_stages (process_id, name, display_order) values (v_process_id, v_stage_names[v_i], v_i - 1);
  end loop;
end $$;
