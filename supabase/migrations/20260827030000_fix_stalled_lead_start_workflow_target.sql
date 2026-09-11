-- Summit Tax & Financial Services' "Lead Stalled- No Organizer" automation
-- has a branch that fires when a stalled lead finally submits their
-- organizer mid-sequence, which starts a follow-up automation -- but that
-- automation had since been deleted, leaving a dangling reference that
-- blocked activation. Repoints it at "New Leads Enters CRM" so a
-- late-submitting lead resumes normal onboarding instead of dead-ending.
update public.automation_steps
set action_config = jsonb_build_object('automation_id', 'fe7e2a0e-4ac2-4c19-b013-672c8ea6ce25')
where id = '3032f22f-b0ad-423b-aae6-fc3c9e04fcf8'
  and automation_id = '8be10c2a-5667-4859-931e-124ff7b503c6'
  and action_type = 'start_workflow';
