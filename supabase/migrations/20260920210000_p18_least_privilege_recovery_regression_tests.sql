-- ============================================================================
-- MIGRATION RECONCILIATION PHASE 1.8 -- regression self-test
--
-- New content authored 2026-09-20 (today), not a recovery of a historical
-- production migration. Filename uses today's real authoring date. Never
-- applied to production; safe to apply normally (fresh CREATE, no
-- collision) whenever this branch is deployed.
--
-- Proves the least-privilege state recovered in this phase (99 functions
-- locked to authenticated-only, 86 internal functions locked to
-- service_role-only, 4 tables with no anon/authenticated grants) remains
-- represented. Deliberately EXCLUDES search_clients from the group-A check
-- -- Phase 1.8 discovered production's live search_clients has a different
-- (14-parameter) signature than what these migrations target, with a
-- known, already-live, out-of-scope PUBLIC/anon execute grant on that new
-- signature. Asserting it here would make this test fail for a reason
-- this phase was explicitly told not to fix; it is documented instead in
-- the migration file header and the Phase 1.8 report, not silently
-- covered up or asserted around it here.
create or replace function public.test_p18_least_privilege_recovery()
returns table(check_name text, passed boolean, detail text)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_group_a text[] := array[
    'acknowledge_automation_run','add_client_address','add_client_email','add_client_phone','advance_pipeline_stage',
    'apply_manual_payment_to_installment','approve_organizer_information_request_item','assign_firm_package','assign_learning_course',
    'attest_signature_presence','can_access_admin_ai','cancel_signature_request','create_engagement','create_manual_firm_connection',
    'create_partner_onboarding','decide_automation_step','delete_client_email','delete_client_phone','delete_installed_template',
    'delete_workflow_pipeline','duplicate_installed_template','engagement_has_signed_letter','flag_organizer_field_for_info',
    'generate_firm_payout','get_ero_connected_partners','get_ero_return_status','get_ero_tax_year_metrics','get_firm_production',
    'get_learning_assignment_rollup','get_learning_completion_rollup','get_my_partner_onboarding','get_my_sponsorship_transition',
    'get_network_bank_software_distribution','get_network_filing_volume','get_network_package_revenue','get_network_partner_production',
    'get_network_payout_export','get_network_payout_summary','get_network_production','get_network_revenue_share',
    'get_network_review_status_summary','get_portal_client_contact','get_quiz_for_taking','get_site_page_preview',
    'get_workspace_member_emails','get_workspace_tags','import_bank_product_transactions','install_marketplace_template',
    'list_marketplace_templates','list_partner_onboardings','list_workspace_templates','mark_client_lost',
    'mark_document_request_reviewed','mark_firm_payout_paid','mark_lesson_complete','mark_organizer_information_request_responded',
    'mark_organizer_information_request_viewed','notify_staff_organizer_information_responded','propose_client_sensitive_field',
    'propose_organizer_answer_correction','record_organizer_response_activity','record_partner_onboarding_review',
    'reject_organizer_information_request_item','release_sponsored_staff_member','reorder_funnel_pages','reorder_process_stage',
    'reorder_site_page_sections','reorder_site_popup_sections','request_finding_autofix','reveal_firm_caf','run_automation_test',
    'save_organizer_dynamic_required_answer','save_organizer_reopened_field_answer','send_organizer_information_request',
    'send_organizer_to_ero_review','set_agent_finding_status','set_client_address_primary','set_client_email_primary',
    'set_client_phone_primary','set_client_task_completed','set_finding_autofix_result','set_firm_tax_profile',
    'set_installed_template_enabled','set_partner_onboarding_agreement_request','set_partner_onboarding_bank_software_setup',
    'set_partner_onboarding_training','set_platform_ai_operator','set_platform_ai_operator_by_id','set_signature_request_expiry',
    'start_agent_run','start_personal_billing_setup','submit_partner_onboarding_application','submit_quiz_attempt',
    'unassign_learning_course','unflag_organizer_information_request_item','update_agent_finding_status','update_manual_firm_connection',
    'validate_automation'
  ];
  v_group_b text[] := array[
    '_maybe_enter_review','_maybe_reach_partner_onboarding_ready','_notify_admins_of_organizer_submitted','_notify_admins_of_quote_response',
    '_partner_onboarding_agreement_signed','_partner_onboarding_documents_completed','_propose_client_field_from_organizer_answer',
    '_resolve_onboarding_default_reviewer','advance_pipeline_on_stage_completed','append_agent_run_event','apply_pipeline_stage_default_assignment',
    'auto_assign_client_relationship_manager','cancel_overdue_quotes','cleanup_pipeline_runs_on_client_delete','cleanup_pipeline_runs_on_engagement_delete',
    'complete_agent_run','correlate_agent_findings','create_agent_finding','create_organizer_information_request',
    'enforce_default_reviewer_is_ero_member','enforce_ero_staff_assignment_restriction','enforce_onboarding_stage_source_of_truth',
    'enforce_storage_capacity','enqueue_calendar_sync','fire_client_message_received_automations','fire_date_reminder_automations',
    'fire_document_request_completed_automations','fire_document_request_sent_automations','fire_document_uploaded_automations',
    'fire_email_engagement_event_automations','fire_engagement_letter_signed_automations','fire_engagement_share_created_automations',
    'fire_firm_package_purchase_automations','fire_invoice_overdue_automations','fire_invoice_paid_automations','fire_invoice_sent_automations',
    'fire_lead_assigned_automations','fire_lead_created_automations','fire_lead_status_changed_automations','fire_lead_updated_automations',
    'fire_organizer_information_request_resolved_automations','fire_organizer_response_review_decided_automations',
    'fire_partner_onboarding_created_automations','fire_partner_onboarding_status_changed_automations','fire_payment_plan_installment_paid_automations',
    'fire_pipeline_stage_entered_automations','fire_quote_created_automations','fire_quote_status_changed_automations',
    'fire_service_interest_automations','fire_sms_engagement_event_automations','fire_task_completed_automations','fire_task_created_automations',
    'fire_task_overdue_automations','flip_lead_on_quote_acceptance','guard_delete_if_wired_to_automation','is_ai_sandbox_workspace',
    'is_module_unlocked','is_platform_ai_operator','learning_hub_reachable_workspaces','network_child_relationship_types',
    'notify_admins_of_automation_failure','notify_appointment_booked_online','notify_client_of_quote_change','notify_invoice_paid',
    'notify_organizer_information_request','notify_organizer_reviewed','notify_payment_received','notify_staff_document_request_completed',
    'portal_client_id','record_agent_evidence','resolve_organizer_information_request','resolve_organizer_information_request_if_done',
    'revoke_expired_portal_access','set_organizer_answer_review_status','set_partner_onboarding_document_request','should_advance_wait_until_step',
    'sync_client_emails_forward','sync_client_phones_forward','sync_client_primary_email','sync_client_primary_phone',
    'sync_client_relationships_from_answer_change','sync_client_relationships_from_organizer_submission','tag_client_on_invoice_paid',
    'tag_client_on_invoice_sent','update_partner_onboarding_requirements','withdraw_partner_onboarding'
  ];
  v_group_a_tables text[] := array['rate_limit_hits','workspace_ghl_connections','workspace_jotform_connections','workspace_partner_purchase_webhooks'];
  v_bad_a text[];
  v_bad_b text[];
  v_bad_tables text[];
begin
  select array_agg(f) into v_bad_a
  from unnest(v_group_a) f
  where not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = f
      and has_function_privilege('authenticated', p.oid, 'EXECUTE')
      and not has_function_privilege('anon', p.oid, 'EXECUTE')
      and not has_function_privilege('public', p.oid, 'EXECUTE')
  );

  return query select
    'least_privilege_group_a_authenticated_only'::text,
    v_bad_a is null,
    coalesce('wrong ACL on: ' || array_to_string(v_bad_a, ', '), 'all ' || array_length(v_group_a, 1)::text || ' functions correctly authenticated-only (search_clients intentionally excluded, see file header)');

  select array_agg(f) into v_bad_b
  from unnest(v_group_b) f
  where not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = f
      and not has_function_privilege('anon', p.oid, 'EXECUTE')
      and not has_function_privilege('authenticated', p.oid, 'EXECUTE')
      and not has_function_privilege('public', p.oid, 'EXECUTE')
  );

  return query select
    'least_privilege_group_b_service_role_only'::text,
    v_bad_b is null,
    coalesce('wrong ACL on: ' || array_to_string(v_bad_b, ', '), 'all ' || array_length(v_group_b, 1)::text || ' functions correctly locked to service_role only');

  select array_agg(t) into v_bad_tables
  from unnest(v_group_a_tables) t
  where exists (
    select 1 from information_schema.role_table_grants g
    where g.table_schema = 'public' and g.table_name = t and g.grantee in ('anon', 'authenticated')
  );

  return query select
    'least_privilege_internal_tables_no_client_grants'::text,
    v_bad_tables is null,
    coalesce('unexpected grant on: ' || array_to_string(v_bad_tables, ', '), 'all ' || array_length(v_group_a_tables, 1)::text || ' tables have no anon/authenticated grants');
end;
$function$;

revoke all on function public.test_p18_least_privilege_recovery() from public, anon, authenticated;
grant execute on function public.test_p18_least_privilege_recovery() to service_role;
