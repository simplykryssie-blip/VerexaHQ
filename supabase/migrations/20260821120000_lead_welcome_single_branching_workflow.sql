-- Replaces the two separate lead-welcome automations with a single one
-- using the platform's existing condition/branch engine (automation_steps
-- with action_type='condition' + automation_step_edges with
-- branch_conditions, already fully built -- see
-- 20260819172505_automation_executor_graph_traversal.sql and
-- 20260819191450_allow_unconnected_branch_edges.sql -- and already exposed
-- in the Workflows builder UI for every workspace via the "Add condition"
-- node). One trigger, one workflow, a real branch inside it, per explicit
-- product direction: this capability isn't workspace-specific data, it's a
-- core engine feature -- what's workspace-owned here is just this
-- particular automation's configuration.
--
-- Branch edges read off automation_runs.trigger_snapshot (frozen once when
-- the run is created), not a live re-query -- so this doesn't have the
-- same-event race the two-automation version had, where one automation's
-- own action could flip the other's live condition mid-event.
do $$
declare
  v_workspace_id uuid := '74321fb2-9a18-4625-ab12-01c98e888667';
  v_automation_id uuid := gen_random_uuid();
  v_condition_step_id uuid := gen_random_uuid();
  v_invite_step_id uuid := gen_random_uuid();
  v_no_portal_email_step_id uuid := gen_random_uuid();
  v_has_portal_email_step_id uuid := gen_random_uuid();
begin
  delete from public.automation_steps where automation_id in ('e049a7f8-868d-48a7-95e3-ce012cf0f25b', 'bfc36309-ebe9-4cf4-be6e-02d487fc4b6c');
  delete from public.automations where id in ('e049a7f8-868d-48a7-95e3-ce012cf0f25b', 'bfc36309-ebe9-4cf4-be6e-02d487fc4b6c');

  insert into public.automations (id, workspace_id, name, slug, description, trigger_type, is_enabled, status)
  values (
    v_automation_id, v_workspace_id, 'New Lead Welcome', 'new-lead-welcome',
    'Checks whether the new lead already has a portal account. If not, invites them and sends a welcome email explaining what happens after they complete the portal. If they already have one, sends a welcome email pointing them straight at it.',
    'lead.created', true, 'published'
  );

  insert into public.automation_steps (id, automation_id, display_order, action_type, action_config) values
  (v_condition_step_id, v_automation_id, 0, 'condition', '{}'),
  (v_invite_step_id, v_automation_id, 1, 'invite_to_portal', '{}'),
  (v_no_portal_email_step_id, v_automation_id, 2, 'send_email', jsonb_build_object('template_slug', 'lead-welcome-email')),
  (v_has_portal_email_step_id, v_automation_id, 3, 'send_email', jsonb_build_object('template_slug', 'lead-welcome-email-portal-existing'));

  insert into public.automation_step_edges (automation_id, from_step_id, to_step_id, branch_conditions, label, sort_order) values
  (v_automation_id, v_condition_step_id, v_invite_step_id,
    '[{"field": "lead.portal_exists_at_creation", "op": "eq", "value": "false"}]', 'No portal yet', 0),
  (v_automation_id, v_condition_step_id, v_has_portal_email_step_id,
    '[{"field": "lead.portal_exists_at_creation", "op": "eq", "value": "true"}]', 'Portal already set up', 1),
  (v_automation_id, v_invite_step_id, v_no_portal_email_step_id, null, null, 0);
end $$;
