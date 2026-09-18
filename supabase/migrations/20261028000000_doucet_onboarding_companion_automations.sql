-- P1 release reconciliation: Doucet Financial Group's Service Bureau partner
-- onboarding lifecycle was left with two dead pipeline transitions.
--
-- Reconciliation against live production (project daxpavvsotvsyqqntddc)
-- performed before writing this migration:
--
--   - The original P0 #3 fix (retargeting the "Software/ Banking Setup"
--     automation, id f0085488-6bd1-4cac-83e9-c7720c0d9b8c, onto
--     partner_onboarding.status_changed / to_status=setup, enabling it, and
--     adding its entry step that moves the pipeline into "Software &
--     Banking Setup") is CONFIRMED ALREADY LIVE -- trigger_type,
--     trigger_config, is_enabled, status, the entry step at display_order
--     -1, and its edge into the existing 12-step chain all match exactly
--     what that fix intended. Nothing in this migration touches it again.
--   - Two companion automations from that same fix's migration
--     (release-fix/p0-doucet-software-banking, never merged) were NOT
--     applied live: "Partner Onboarding Created" (partner_onboarding.created
--     -> move to "Onboarding" stage) and "Application Submitted"
--     (partner_onboarding.status_changed / to_status=in_progress -> move to
--     "Awaiting Completed Docs" stage). Confirmed no other function
--     (fire_partner_onboarding_created_automations,
--     submit_partner_onboarding_application, _get_or_create_partner_onboarding)
--     performs either pipeline move directly -- move_pipeline_stage inside
--     execute_automation_step is the only mechanism that ever moves a
--     firm_connection's pipeline, so without these two automations a new
--     Doucet partner onboarding's pipeline never leaves its initial state
--     until the (already-live) Software & Banking Setup automation's own
--     entry step fires much later. Both are added below, unchanged from the
--     original fix (same slugs, same idempotent guard, same config).
--
-- Deliberately NOT recreated: that same old migration's third companion,
-- "Setup Complete / Ready" (partner_onboarding.status_changed / to_status=
-- ready -> move to "Ready For Activation"). Live inspection found this
-- would duplicate a transition the already-live Software & Banking Setup
-- automation's own step chain performs itself (its step "Move to Ready For
-- Activation", display_order 6, fires once its own internal "Banking
-- Approved?" condition and "Check All Requirements" task are both done) --
-- and partner_onboardings.status only reaches 'ready' via a *separate*,
-- independent signal (_maybe_reach_partner_onboarding_ready, driven by the
-- Firms page's manual bank_software_setup_completed_at/training_completed_at
-- flags, not by this automation's own task completions). Because "Ready
-- For Activation" (process_stages.display_order 5) sits before "Active
-- Service Bureau" (display_order 6) in this process, and
-- move_pipeline_stage refuses to move a pipeline backward, a companion
-- automation reacting to status=ready would raise "Moving backward through
-- pipeline stages is not supported by this action" and fail its own run
-- outright if the internal chain's own move to Ready-For-Activation (or
-- further, to Active Service Bureau) has already happened by the time the
-- separate manual flags catch up -- a real, deterministic conflict, not a
-- hypothetical one. Recreating it would add a second, racing path to the
-- same milestone instead of completing the lifecycle. If a future product
-- decision wants partner_onboardings.status=ready to independently confirm
-- (not move) the pipeline, that is a new, narrower automation than the one
-- the old migration wrote, and out of this reconciliation's scope.
do $$
declare
  v_workspace_id uuid := '0867bbc5-e62b-4217-8bad-11351c24def5'; -- Doucet Financial Group
  v_process_id uuid := '517375df-7be6-4182-9b90-200892579257'; -- Service Bureau Tax Pro Onboarding
  v_stage_onboarding uuid := '075c7490-5b49-40b0-abb7-fd35a2078f96';
  v_stage_awaiting_docs uuid := '98beba0e-0b5c-4daf-bf0d-8aea20038124';
  v_new_automation_id uuid;
begin
  -- 1. Partner Onboarding Created -> move into the initial "Onboarding" stage.
  if not exists (select 1 from public.automations where workspace_id = v_workspace_id and slug = 'doucet-partner-onboarding-created') then
    insert into public.automations (workspace_id, name, slug, description, trigger_type, is_enabled, status)
    values (
      v_workspace_id, 'Partner Onboarding Created', 'doucet-partner-onboarding-created',
      'A new Service Bureau partner onboarding record was created -- places it into the Onboarding stage of the Service Bureau Tax Pro Onboarding pipeline.',
      'partner_onboarding.created', true, 'published'
    )
    returning id into v_new_automation_id;

    insert into public.automation_steps (automation_id, display_order, action_type, action_config, display_name)
    values (
      v_new_automation_id, 0, 'move_pipeline_stage',
      jsonb_build_object('process_id', v_process_id, 'process_stage_id', v_stage_onboarding),
      'Pipeline: Onboarding'
    );
  end if;

  -- 2. Application Submitted (pending -> in_progress) -> move into "Awaiting
  --    Completed Docs". The review task itself is already created directly by
  --    submit_partner_onboarding_application -- no duplicate task step needed here.
  if not exists (select 1 from public.automations where workspace_id = v_workspace_id and slug = 'doucet-partner-application-submitted') then
    insert into public.automations (workspace_id, name, slug, description, trigger_type, trigger_config, is_enabled, status)
    values (
      v_workspace_id, 'Application Submitted', 'doucet-partner-application-submitted',
      'A partner submitted their onboarding application -- moves them into Awaiting Completed Docs while the agreement/documents/review requirements are satisfied.',
      'partner_onboarding.status_changed', jsonb_build_object('to_status', 'in_progress'), true, 'published'
    )
    returning id into v_new_automation_id;

    insert into public.automation_steps (automation_id, display_order, action_type, action_config, display_name)
    values (
      v_new_automation_id, 0, 'move_pipeline_stage',
      jsonb_build_object('process_id', v_process_id, 'process_stage_id', v_stage_awaiting_docs),
      'Pipeline: Awaiting Completed Docs'
    );
  end if;
end;
$$;
