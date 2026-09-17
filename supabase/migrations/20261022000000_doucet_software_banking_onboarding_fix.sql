-- Release blocker P0 #3: Doucet Financial Group's Service Bureau -> partner
-- ERO/PTIN onboarding never actually executed the "Software & Banking
-- Setup" work, because no *enabled* automation was ever wired to the
-- correct, already-fully-functional partner_onboarding.status_changed
-- trigger family.
--
-- Confirmed live and unchanged by this migration (all already correct --
-- no engine/action/function code needs to change):
--   - fire_partner_onboarding_created_automations /
--     fire_partner_onboarding_status_changed_automations correctly match,
--     evaluate conditions, and populate automation_runs.connection_id /
--     .onboarding_id (20260916190255_automation_runs_partner_identity.sql).
--   - execute_automation_step's send_email/send_sms/send_document_request/
--     create_task/move_pipeline_stage/add_tag/remove_tag branches are all
--     already connection-aware (resolve the partner recipient via
--     firm_connections.child_workspace_id -> workspaces.primary_contact_email
--     /phone, or firm_connection_id directly for tasks/tags/pipeline moves).
--   - record_partner_onboarding_review / submit_partner_onboarding_application
--     / _maybe_enter_review / _maybe_reach_partner_onboarding_ready already
--     correctly drive partner_onboardings.status through
--     pending -> in_progress -> under_review -> setup -> ready (and
--     rejected), including the exact "approved -> setup" transition this
--     release audit flagged as broken -- the status machine itself was
--     never the problem.
--
-- The actual gap, for Doucet's workspace specifically: zero automations
-- existed on partner_onboarding.created or partner_onboarding.status_changed
-- at all. The one automation with the real, hand-authored Software & Banking
-- business content ("Software/ Banking Setup", id f0085488-6bd1-4cac-83e9-
-- c7720c0d9b8c) was wired to the wrong, unrelated trigger family
-- (lead.stage_entered, on the Software & Banking Setup pipeline stage) and
-- left disabled/draft -- that trigger can never correctly fire for a
-- firm_connection/partner_onboarding-scoped run in the first place, since
-- lead.stage_entered fires from pipeline_runs, not partner_onboardings.
--
-- Fix: retarget that automation onto the correct trigger and enable it,
-- adding exactly one new step (the pipeline-stage move into "Software &
-- Banking Setup" itself, which nothing currently performs on this path) --
-- its existing 12 steps and their branching are left completely untouched,
-- preserving the already-intended banking-review/task/activation-email
-- business logic verbatim. Two small new automations cover the two other
-- currently-unwired transitions this release audit's required end-to-end
-- test exercises (onboarding created -> initial pipeline stage; setup ->
-- ready -> Ready For Activation). "Application Submitted" and "Ready for
-- Review" need no automation at all: submit_partner_onboarding_application
-- and _maybe_enter_review already create the correct internal review tasks
-- directly, which is the existing, correct implementation for those two
-- steps.
--
-- Deliberately NOT touched (separate, pre-existing issues, out of this P0's
-- scope -- see the P0 #3 final report's Remaining Issues):
--   - "Software/ Banking Package Purchased" (id 185626b5-9feb-4d0c-908d-
--     33e368273f19, trigger firm_package.purchased): has its own,
--     independent impossible-condition bug (client.organizer_status /
--     engagement.engagement_letter_status checked against a run whose
--     client_id/engagement_id are always null for this trigger type). Not
--     in this release's required test path and not part of the confirmed
--     "approved -> setup" failure chain this P0 targets. firm_package.purchased
--     is intentionally left as a generic purchase event per this release's
--     architecture rules, not repurposed as the canonical onboarding driver.
--   - "Rejected" automation: no expected behavior was specified for it in
--     this release's required product behavior or end-to-end test, and no
--     rejected-specific pipeline stage exists in Doucet's pipeline --
--     nothing to wire yet.

do $$
declare
  v_workspace_id uuid := '0867bbc5-e62b-4217-8bad-11351c24def5'; -- Doucet Financial Group
  v_process_id uuid := '517375df-7be6-4182-9b90-200892579257'; -- Service Bureau Tax Pro Onboarding
  v_stage_onboarding uuid := '075c7490-5b49-40b0-abb7-fd35a2078f96';
  v_stage_awaiting_docs uuid := '98beba0e-0b5c-4daf-bf0d-8aea20038124';
  v_stage_software_banking uuid := '0019b49d-7219-4da1-826a-d0e1f4676629';
  v_stage_ready_for_activation uuid := '2bc51b1c-6ba7-45d8-870b-c7ef9356178f';
  v_software_banking_setup_automation_id uuid := 'f0085488-6bd1-4cac-83e9-c7720c0d9b8c';
  v_software_banking_setup_entry_step_id uuid := '74e38fae-8e84-40e8-8625-9f3f60587c78';
  v_new_automation_id uuid;
  v_new_step_id uuid;
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

  -- 3. Approved -> Setup: retarget the existing, already-correct 12-step
  --    "Software/ Banking Setup" automation onto the real trigger and enable
  --    it. Its own 12 steps/edges are untouched -- only the top-level
  --    trigger changes, plus one new entry step performing the pipeline
  --    move into "Software & Banking Setup" that this path needs and that
  --    nothing currently performs.
  update public.automations
  set trigger_type = 'partner_onboarding.status_changed',
      trigger_config = jsonb_build_object('to_status', 'setup'),
      is_enabled = true,
      status = 'published'
  where id = v_software_banking_setup_automation_id;

  if not exists (
    select 1 from public.automation_steps
    where automation_id = v_software_banking_setup_automation_id and display_order = -1
  ) then
    insert into public.automation_steps (automation_id, display_order, action_type, action_config, display_name)
    values (
      v_software_banking_setup_automation_id, -1, 'move_pipeline_stage',
      jsonb_build_object('process_id', v_process_id, 'process_stage_id', v_stage_software_banking),
      'Pipeline: Software & Banking Setup'
    )
    returning id into v_new_step_id;

    insert into public.automation_step_edges (automation_id, from_step_id, to_step_id, sort_order)
    values (v_software_banking_setup_automation_id, v_new_step_id, v_software_banking_setup_entry_step_id, 0);
  end if;

  -- 4. Setup Complete / Ready (setup -> ready) -> move into "Ready For
  --    Activation". partner_onboardings.status reaching 'ready' is already
  --    driven correctly by the existing set_partner_onboarding_training /
  --    set_partner_onboarding_bank_software_setup RPCs (the Firms page's
  --    Onboarding panel) via _maybe_reach_partner_onboarding_ready -- this
  --    automation only reacts to that transition. The final Ready For
  --    Activation -> Active Service Bureau move stays exactly as it already
  --    is in the Software & Banking Setup automation above (gated behind a
  --    staff manually completing the Onboarding Call task) -- an
  --    intentionally manual activation step, not something this migration
  --    adds or automates further.
  if not exists (select 1 from public.automations where workspace_id = v_workspace_id and slug = 'doucet-partner-setup-complete-ready') then
    insert into public.automations (workspace_id, name, slug, description, trigger_type, trigger_config, is_enabled, status)
    values (
      v_workspace_id, 'Setup Complete / Ready', 'doucet-partner-setup-complete-ready',
      'Software & banking setup requirements are satisfied and the onboarding is ready -- moves the partner into Ready For Activation.',
      'partner_onboarding.status_changed', jsonb_build_object('to_status', 'ready'), true, 'published'
    )
    returning id into v_new_automation_id;

    insert into public.automation_steps (automation_id, display_order, action_type, action_config, display_name)
    values (
      v_new_automation_id, 0, 'move_pipeline_stage',
      jsonb_build_object('process_id', v_process_id, 'process_stage_id', v_stage_ready_for_activation),
      'Pipeline: Ready For Activation'
    );
  end if;
end;
$$;
