-- New Lead + New Lead Stalled pipelines for the Ascend Tax Office (ERO)
-- demo workspace, per the owner's requested stage layout for testing the
-- ERO reviewer-routing and lead-intake workflows.

do $$
declare
  v_workspace_id uuid := 'b53cc047-e1dd-4a6e-92f4-88b3c37f48af';
  v_process_id uuid;
  v_stage_names text[];
  v_i int;
begin
  v_stage_names := array['New Lead Entered', 'Portal Created', 'Organizer completed', 'Organizer pending VA review'];

  insert into public.processes (workspace_id, name, slug, status, created_by)
  values (v_workspace_id, 'New Lead', 'new-lead', 'published', null)
  returning id into v_process_id;

  for v_i in 1 .. array_length(v_stage_names, 1) loop
    insert into public.process_stages (process_id, name, display_order) values (v_process_id, v_stage_names[v_i], v_i - 1);
  end loop;

  v_stage_names := array['Stalled- No organizer', '2nd attempt', '3rd attempt', 'add to nurture leads'];

  insert into public.processes (workspace_id, name, slug, status, created_by)
  values (v_workspace_id, 'New Lead Stalled', 'new-lead-stalled', 'published', null)
  returning id into v_process_id;

  for v_i in 1 .. array_length(v_stage_names, 1) loop
    insert into public.process_stages (process_id, name, display_order) values (v_process_id, v_stage_names[v_i], v_i - 1);
  end loop;
end $$;
