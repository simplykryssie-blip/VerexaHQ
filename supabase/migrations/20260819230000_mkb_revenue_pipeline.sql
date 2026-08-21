-- MKB's actual revenue pipeline (rebuilt from their GHL "MKB | Revenue
-- Pipeline" -- same 8 stages, new pipeline so the workspace's existing
-- "New Lead" process/its future leads are untouched). MKB has zero
-- clients today, so repointing the workspace's default lead pipeline to
-- this one has no blast radius. Scoped to the MKB workspace only, per
-- explicit instruction: nothing built for MKB in this pass is shared
-- with or copied into any other workspace.
do $$
declare
  v_workspace_id uuid := '9d3e27c8-e7ed-4db0-a0ce-9b2fa0fe23c7';
  v_process_id uuid;
begin
  insert into public.processes (workspace_id, name, slug, description, status)
  values (v_workspace_id, 'MKB Revenue Pipeline', 'mkb-revenue-pipeline', 'Lead-to-client revenue pipeline for MKB Financial Group.', 'published')
  returning id into v_process_id;

  insert into public.process_stages (process_id, name, display_order)
  values
    (v_process_id, 'New / Needs Review', 1),
    (v_process_id, 'Consult Needed', 2),
    (v_process_id, 'Consult Booked', 3),
    (v_process_id, 'Consult Completed', 4),
    (v_process_id, 'Invoice Sent', 5),
    (v_process_id, 'Paid / Onboarding', 6),
    (v_process_id, 'Active Client', 7),
    (v_process_id, 'Closed / Lost', 8);

  update public.workspaces set default_lead_process_id = v_process_id where id = v_workspace_id;
end $$;
