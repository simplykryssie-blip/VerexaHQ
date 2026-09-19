-- Least-privilege SECURITY DEFINER RPC cleanup.
--
-- Every REVOKE below was decided from real evidence, not the function's name:
-- an app-code `.rpc(...)` call site search across app/components/lib (which role
-- calls it -- a public pre-auth page, an authenticated staff/portal page, or a
-- service-role cron/webhook route), a live check of every RLS policy's qual/
-- with_check for a dependency on the function (revoking those would break every
-- query against the underlying table for that role, not just the RPC path), and
-- a check of pg_constraint/pg_attrdef for the same reason. Functions embedded in
-- RLS policies (is_portal_user, is_portal_user_for_entity, is_portal_accessible_
-- entity_id, is_service_bureau_workspace, has_learning_hub_access, has_pending_
-- engagement_share_access, is_client_portal_window_active) are deliberately left
-- untouched for exactly this reason. No search_path changes -- all 463 SECURITY
-- DEFINER functions already had one pinned before this migration.

-- Part 1: revoke anon only -- 99 functions with a confirmed
-- staff-authenticated or logged-in-portal-user caller (or an internal has_permission/
-- is_portal_user/is_platform_admin check inside the function itself that anon could
-- never satisfy), so anon execution serves no legitimate purpose while authenticated
-- access remains genuinely required.

revoke execute on function public.acknowledge_automation_run(p_run_id uuid) from anon;
revoke execute on function public.add_client_address(p_client_id uuid, p_workspace_id uuid, p_street text, p_city text, p_state text, p_zip text, p_make_primary boolean, p_address_type text) from anon;
revoke execute on function public.add_client_email(p_client_id uuid, p_workspace_id uuid, p_email text, p_make_primary boolean, p_email_type text) from anon;
revoke execute on function public.add_client_phone(p_client_id uuid, p_workspace_id uuid, p_phone text, p_make_primary boolean, p_phone_type text) from anon;
revoke execute on function public.advance_pipeline_stage(p_entity_type text, p_entity_id uuid, p_process_id uuid, p_process_stage_id uuid) from anon;
revoke execute on function public.apply_manual_payment_to_installment(p_payment_id uuid, p_payment_plan_id uuid) from anon;
revoke execute on function public.approve_organizer_information_request_item(p_item_id uuid) from anon;
revoke execute on function public.assign_firm_package(p_connection_id uuid, p_package_id uuid) from anon;
revoke execute on function public.assign_learning_course(p_course_id uuid, p_user_id uuid, p_due_date date) from anon;
revoke execute on function public.attest_signature_presence(p_signer_id uuid) from anon;
revoke execute on function public.can_access_admin_ai() from anon;
revoke execute on function public.cancel_signature_request(p_signature_request_id uuid) from anon;
revoke execute on function public.create_engagement(p_workspace_id uuid, p_client_id uuid, p_service_id uuid, p_assigned_staff_id uuid, p_priority engagement_priority, p_process_id uuid, p_case_type text, p_due_date timestamp with time zone) from anon;
revoke execute on function public.create_manual_firm_connection(p_workspace_id uuid, p_relationship_type text, p_name text, p_owner_name text, p_phone text, p_email text, p_website text, p_address text, p_notes text) from anon;
revoke execute on function public.create_partner_onboarding(p_workspace_id uuid, p_firm_connection_id uuid, p_package_id uuid) from anon;
revoke execute on function public.decide_automation_step(p_pending_step_id uuid, p_decided_option text) from anon;
revoke execute on function public.delete_client_email(p_email_id uuid) from anon;
revoke execute on function public.delete_client_phone(p_phone_id uuid) from anon;
revoke execute on function public.delete_installed_template(p_workspace_id uuid, p_installation_id uuid) from anon;
revoke execute on function public.delete_workflow_pipeline(p_process_id uuid) from anon;
revoke execute on function public.duplicate_installed_template(p_workspace_id uuid, p_installation_id uuid, p_new_name text) from anon;
revoke execute on function public.engagement_has_signed_letter(p_engagement_id uuid) from anon;
revoke execute on function public.flag_organizer_field_for_info(p_organizer_response_id uuid, p_organizer_field_id uuid, p_instance_index integer, p_note text) from anon;
revoke execute on function public.generate_firm_payout(p_connection_id uuid, p_period_start date, p_period_end date) from anon;
revoke execute on function public.get_ero_connected_partners(p_workspace_id uuid, p_relationship_types text[]) from anon;
revoke execute on function public.get_ero_return_status(p_workspace_id uuid) from anon;
revoke execute on function public.get_ero_tax_year_metrics(p_workspace_id uuid) from anon;
revoke execute on function public.get_firm_production(p_connection_id uuid, p_period_start date, p_period_end date) from anon;
revoke execute on function public.get_learning_assignment_rollup(p_owner_workspace_id uuid) from anon;
revoke execute on function public.get_learning_completion_rollup(p_owner_workspace_id uuid) from anon;
revoke execute on function public.get_my_partner_onboarding(p_workspace_id uuid) from anon;
revoke execute on function public.get_my_sponsorship_transition() from anon;
revoke execute on function public.get_network_bank_software_distribution(p_workspace_id uuid) from anon;
revoke execute on function public.get_network_filing_volume(p_workspace_id uuid, p_tax_year integer) from anon;
revoke execute on function public.get_network_package_revenue(p_workspace_id uuid) from anon;
revoke execute on function public.get_network_partner_production(p_workspace_id uuid, p_period_start date, p_period_end date, p_sort_by text) from anon;
revoke execute on function public.get_network_payout_export(p_workspace_id uuid, p_period_start date, p_period_end date, p_status text) from anon;
revoke execute on function public.get_network_payout_summary(p_workspace_id uuid) from anon;
revoke execute on function public.get_network_production(p_workspace_id uuid, p_period_start date, p_period_end date) from anon;
revoke execute on function public.get_network_revenue_share(p_workspace_id uuid, p_period_start date, p_period_end date) from anon;
revoke execute on function public.get_network_review_status_summary(p_workspace_id uuid) from anon;
revoke execute on function public.get_portal_client_contact() from anon;
revoke execute on function public.get_quiz_for_taking(p_module_id uuid) from anon;
revoke execute on function public.get_site_page_preview(p_page_id uuid) from anon;
revoke execute on function public.get_workspace_member_emails(p_workspace_id uuid) from anon;
revoke execute on function public.get_workspace_tags(p_workspace_id uuid) from anon;
revoke execute on function public.import_bank_product_transactions(p_workspace_id uuid, p_rows jsonb) from anon;
revoke execute on function public.install_marketplace_template(p_workspace_id uuid, p_marketplace_template_id uuid, p_name text) from anon;
revoke execute on function public.list_marketplace_templates(p_workspace_id uuid) from anon;
revoke execute on function public.list_partner_onboardings(p_workspace_id uuid) from anon;
revoke execute on function public.list_workspace_templates(p_workspace_id uuid) from anon;
revoke execute on function public.mark_client_lost(p_client_id uuid, p_reason text) from anon;
revoke execute on function public.mark_document_request_reviewed(p_document_request_id uuid) from anon;
revoke execute on function public.mark_firm_payout_paid(p_payout_id uuid, p_payment_note text) from anon;
revoke execute on function public.mark_lesson_complete(p_module_id uuid) from anon;
revoke execute on function public.mark_organizer_information_request_responded(p_request_id uuid) from anon;
revoke execute on function public.mark_organizer_information_request_viewed(p_request_id uuid) from anon;
revoke execute on function public.notify_staff_organizer_information_responded(p_response_id uuid, p_item_count integer) from anon;
revoke execute on function public.propose_client_sensitive_field(p_field text, p_new_value text, p_organizer_response_id uuid, p_organizer_field_id uuid) from anon;
revoke execute on function public.propose_organizer_answer_correction(p_item_id uuid, p_proposed_value jsonb) from anon;
revoke execute on function public.record_organizer_response_activity() from anon;
revoke execute on function public.record_partner_onboarding_review(p_workspace_id uuid, p_onboarding_id uuid, p_decision text, p_note text) from anon;
revoke execute on function public.reject_organizer_information_request_item(p_item_id uuid, p_decision_note text) from anon;
revoke execute on function public.release_sponsored_staff_member(p_workspace_id uuid, p_user_id uuid) from anon;
revoke execute on function public.reorder_funnel_pages(p_funnel_id uuid, p_page_ids uuid[]) from anon;
revoke execute on function public.reorder_process_stage(p_stage_id uuid, p_direction text) from anon;
revoke execute on function public.reorder_site_page_sections(p_page_id uuid, p_section_ids uuid[]) from anon;
revoke execute on function public.reorder_site_popup_sections(p_popup_id uuid, p_section_ids uuid[]) from anon;
revoke execute on function public.request_finding_autofix(p_finding_id uuid) from anon;
revoke execute on function public.reveal_firm_caf(p_workspace_id uuid) from anon;
revoke execute on function public.run_automation_test(p_automation_id uuid, p_client_id uuid, p_engagement_id uuid) from anon;
revoke execute on function public.save_organizer_dynamic_required_answer(p_response_id uuid, p_organizer_field_id uuid, p_value jsonb) from anon;
revoke execute on function public.save_organizer_reopened_field_answer(p_item_id uuid, p_value jsonb) from anon;
revoke execute on function public.search_clients(p_workspace_id uuid, p_query text, p_lifecycle_statuses text[], p_tag text, p_service_id uuid, p_assigned_staff_id uuid, p_pipeline_stage_name text, p_missing_documents boolean, p_outstanding_balance boolean, p_limit integer, p_offset integer) from anon;
revoke execute on function public.send_organizer_information_request(p_request_id uuid, p_message text, p_due_date date, p_tags text[], p_send_email boolean, p_send_sms boolean, p_show_in_portal boolean) from anon;
revoke execute on function public.send_organizer_to_ero_review(p_response_id uuid) from anon;
revoke execute on function public.set_agent_finding_status(p_finding_id uuid, p_status text, p_decision_notes text) from anon;
revoke execute on function public.set_client_address_primary(p_address_id uuid) from anon;
revoke execute on function public.set_client_email_primary(p_email_id uuid) from anon;
revoke execute on function public.set_client_phone_primary(p_phone_id uuid) from anon;
revoke execute on function public.set_client_task_completed(p_task_id uuid, p_completed boolean) from anon;
revoke execute on function public.set_finding_autofix_result(p_finding_id uuid, p_autofix_status text, p_note text) from anon;
revoke execute on function public.set_firm_tax_profile(p_workspace_id uuid, p_ein text, p_efin text, p_ptin text, p_clear_ein boolean, p_clear_efin boolean, p_clear_ptin boolean, p_supported_filing_states text[], p_regular_office_hours jsonb, p_tax_season_hours jsonb, p_caf text, p_clear_caf boolean) from anon;
revoke execute on function public.set_installed_template_enabled(p_workspace_id uuid, p_installation_id uuid, p_enabled boolean) from anon;
revoke execute on function public.set_partner_onboarding_agreement_request(p_workspace_id uuid, p_onboarding_id uuid, p_signature_request_id uuid) from anon;
revoke execute on function public.set_partner_onboarding_bank_software_setup(p_workspace_id uuid, p_onboarding_id uuid, p_completed boolean) from anon;
revoke execute on function public.set_partner_onboarding_training(p_workspace_id uuid, p_onboarding_id uuid, p_completed boolean, p_learning_course_id uuid) from anon;
revoke execute on function public.set_platform_ai_operator(p_user_email text, p_is_platform_ai_operator boolean) from anon;
revoke execute on function public.set_platform_ai_operator_by_id(p_user_id uuid, p_is_platform_ai_operator boolean) from anon;
revoke execute on function public.set_signature_request_expiry(p_signature_request_id uuid, p_expires_at timestamp with time zone) from anon;
revoke execute on function public.start_agent_run(p_agent_key text, p_workspace_id uuid, p_run_type text, p_scope jsonb, p_objective text) from anon;
revoke execute on function public.start_personal_billing_setup() from anon;
revoke execute on function public.submit_partner_onboarding_application(p_workspace_id uuid, p_onboarding_id uuid, p_application_data jsonb) from anon;
revoke execute on function public.submit_quiz_attempt(p_module_id uuid, p_answers jsonb) from anon;
revoke execute on function public.unassign_learning_course(p_course_id uuid, p_user_id uuid) from anon;
revoke execute on function public.unflag_organizer_information_request_item(p_item_id uuid) from anon;
revoke execute on function public.update_agent_finding_status(p_finding_id uuid, p_status text, p_decision_notes text) from anon;
revoke execute on function public.update_manual_firm_connection(p_connection_id uuid, p_name text, p_owner_name text, p_phone text, p_email text, p_website text, p_address text) from anon;
revoke execute on function public.validate_automation(p_automation_id uuid) from anon;

-- Part 2: revoke anon AND authenticated -- 86 functions with no
-- application call site of any kind (no anon page, no authenticated page, no
-- portal page) and no RLS/constraint/default dependency. These are trigger-fired
-- (`returns trigger`), called only from within other SECURITY DEFINER functions, or
-- invoked only by a service-role cron/webhook route -- none of which require, or
-- are affected by, an anon/authenticated EXECUTE grant. Trigger firing and function-
-- to-function calls run with the definer's own privileges regardless of these grants.

revoke execute on function public._maybe_enter_review(p_onboarding_id uuid) from anon;
revoke execute on function public._maybe_enter_review(p_onboarding_id uuid) from authenticated;
revoke execute on function public._maybe_reach_partner_onboarding_ready(p_onboarding_id uuid) from anon;
revoke execute on function public._maybe_reach_partner_onboarding_ready(p_onboarding_id uuid) from authenticated;
revoke execute on function public._notify_admins_of_organizer_submitted(p_workspace_id uuid, p_client_id uuid, p_response_id uuid, p_organizer_template_id uuid) from anon;
revoke execute on function public._notify_admins_of_organizer_submitted(p_workspace_id uuid, p_client_id uuid, p_response_id uuid, p_organizer_template_id uuid) from authenticated;
revoke execute on function public._notify_admins_of_quote_response(p_workspace_id uuid, p_client_id uuid, p_quote_id uuid, p_response text) from anon;
revoke execute on function public._notify_admins_of_quote_response(p_workspace_id uuid, p_client_id uuid, p_quote_id uuid, p_response text) from authenticated;
revoke execute on function public._partner_onboarding_agreement_signed() from anon;
revoke execute on function public._partner_onboarding_agreement_signed() from authenticated;
revoke execute on function public._partner_onboarding_documents_completed() from anon;
revoke execute on function public._partner_onboarding_documents_completed() from authenticated;
revoke execute on function public._propose_client_field_from_organizer_answer(p_workspace_id uuid, p_client_id uuid, p_organizer_response_id uuid, p_organizer_field_id uuid, p_client_profile_field text, p_value jsonb) from anon;
revoke execute on function public._propose_client_field_from_organizer_answer(p_workspace_id uuid, p_client_id uuid, p_organizer_response_id uuid, p_organizer_field_id uuid, p_client_profile_field text, p_value jsonb) from authenticated;
revoke execute on function public._resolve_onboarding_default_reviewer(p_workspace_id uuid, p_firm_connection_id uuid) from anon;
revoke execute on function public._resolve_onboarding_default_reviewer(p_workspace_id uuid, p_firm_connection_id uuid) from authenticated;
revoke execute on function public.advance_pipeline_on_stage_completed() from anon;
revoke execute on function public.advance_pipeline_on_stage_completed() from authenticated;
revoke execute on function public.append_agent_run_event(p_run_id uuid, p_level text, p_message text, p_meta jsonb) from anon;
revoke execute on function public.append_agent_run_event(p_run_id uuid, p_level text, p_message text, p_meta jsonb) from authenticated;
revoke execute on function public.apply_pipeline_stage_default_assignment() from anon;
revoke execute on function public.apply_pipeline_stage_default_assignment() from authenticated;
revoke execute on function public.auto_assign_client_relationship_manager() from anon;
revoke execute on function public.auto_assign_client_relationship_manager() from authenticated;
revoke execute on function public.cancel_overdue_quotes() from anon;
revoke execute on function public.cancel_overdue_quotes() from authenticated;
revoke execute on function public.cleanup_pipeline_runs_on_client_delete() from anon;
revoke execute on function public.cleanup_pipeline_runs_on_client_delete() from authenticated;
revoke execute on function public.cleanup_pipeline_runs_on_engagement_delete() from anon;
revoke execute on function public.cleanup_pipeline_runs_on_engagement_delete() from authenticated;
revoke execute on function public.complete_agent_run(p_run_id uuid, p_status text, p_summary jsonb, p_ai_analysis jsonb, p_error_message text) from anon;
revoke execute on function public.complete_agent_run(p_run_id uuid, p_status text, p_summary jsonb, p_ai_analysis jsonb, p_error_message text) from authenticated;
revoke execute on function public.correlate_agent_findings(p_finding_id_a uuid, p_finding_id_b uuid, p_relationship text, p_confidence text) from anon;
revoke execute on function public.correlate_agent_findings(p_finding_id_a uuid, p_finding_id_b uuid, p_relationship text, p_confidence text) from authenticated;
revoke execute on function public.create_agent_finding(p_agent_key text, p_run_id uuid, p_workspace_id uuid, p_category text, p_severity text, p_title text, p_description text, p_fingerprint text, p_expected_behavior text, p_actual_behavior text, p_reproduction_steps jsonb, p_affected_module text, p_related_record_type text, p_related_record_id text, p_ai_analysis jsonb, p_possible_cause text) from anon;
revoke execute on function public.create_agent_finding(p_agent_key text, p_run_id uuid, p_workspace_id uuid, p_category text, p_severity text, p_title text, p_description text, p_fingerprint text, p_expected_behavior text, p_actual_behavior text, p_reproduction_steps jsonb, p_affected_module text, p_related_record_type text, p_related_record_id text, p_ai_analysis jsonb, p_possible_cause text) from authenticated;
revoke execute on function public.create_organizer_information_request(p_response_id uuid, p_message text, p_organizer_field_id uuid, p_send_email boolean, p_send_sms boolean, p_show_in_portal boolean) from anon;
revoke execute on function public.create_organizer_information_request(p_response_id uuid, p_message text, p_organizer_field_id uuid, p_send_email boolean, p_send_sms boolean, p_show_in_portal boolean) from authenticated;
revoke execute on function public.enforce_default_reviewer_is_ero_member() from anon;
revoke execute on function public.enforce_default_reviewer_is_ero_member() from authenticated;
revoke execute on function public.enforce_ero_staff_assignment_restriction() from anon;
revoke execute on function public.enforce_ero_staff_assignment_restriction() from authenticated;
revoke execute on function public.enforce_onboarding_stage_source_of_truth() from anon;
revoke execute on function public.enforce_onboarding_stage_source_of_truth() from authenticated;
revoke execute on function public.enforce_storage_capacity() from anon;
revoke execute on function public.enforce_storage_capacity() from authenticated;
revoke execute on function public.enqueue_calendar_sync() from anon;
revoke execute on function public.enqueue_calendar_sync() from authenticated;
revoke execute on function public.fire_client_message_received_automations() from anon;
revoke execute on function public.fire_client_message_received_automations() from authenticated;
revoke execute on function public.fire_date_reminder_automations() from anon;
revoke execute on function public.fire_date_reminder_automations() from authenticated;
revoke execute on function public.fire_document_request_completed_automations() from anon;
revoke execute on function public.fire_document_request_completed_automations() from authenticated;
revoke execute on function public.fire_document_request_sent_automations() from anon;
revoke execute on function public.fire_document_request_sent_automations() from authenticated;
revoke execute on function public.fire_document_uploaded_automations() from anon;
revoke execute on function public.fire_document_uploaded_automations() from authenticated;
revoke execute on function public.fire_email_engagement_event_automations() from anon;
revoke execute on function public.fire_email_engagement_event_automations() from authenticated;
revoke execute on function public.fire_engagement_letter_signed_automations() from anon;
revoke execute on function public.fire_engagement_letter_signed_automations() from authenticated;
revoke execute on function public.fire_engagement_share_created_automations() from anon;
revoke execute on function public.fire_engagement_share_created_automations() from authenticated;
revoke execute on function public.fire_firm_package_purchase_automations() from anon;
revoke execute on function public.fire_firm_package_purchase_automations() from authenticated;
revoke execute on function public.fire_invoice_overdue_automations() from anon;
revoke execute on function public.fire_invoice_overdue_automations() from authenticated;
revoke execute on function public.fire_invoice_paid_automations() from anon;
revoke execute on function public.fire_invoice_paid_automations() from authenticated;
revoke execute on function public.fire_invoice_sent_automations() from anon;
revoke execute on function public.fire_invoice_sent_automations() from authenticated;
revoke execute on function public.fire_lead_assigned_automations() from anon;
revoke execute on function public.fire_lead_assigned_automations() from authenticated;
revoke execute on function public.fire_lead_created_automations() from anon;
revoke execute on function public.fire_lead_created_automations() from authenticated;
revoke execute on function public.fire_lead_status_changed_automations() from anon;
revoke execute on function public.fire_lead_status_changed_automations() from authenticated;
revoke execute on function public.fire_lead_updated_automations() from anon;
revoke execute on function public.fire_lead_updated_automations() from authenticated;
revoke execute on function public.fire_organizer_information_request_resolved_automations() from anon;
revoke execute on function public.fire_organizer_information_request_resolved_automations() from authenticated;
revoke execute on function public.fire_organizer_response_review_decided_automations() from anon;
revoke execute on function public.fire_organizer_response_review_decided_automations() from authenticated;
revoke execute on function public.fire_partner_onboarding_created_automations() from anon;
revoke execute on function public.fire_partner_onboarding_created_automations() from authenticated;
revoke execute on function public.fire_partner_onboarding_status_changed_automations() from anon;
revoke execute on function public.fire_partner_onboarding_status_changed_automations() from authenticated;
revoke execute on function public.fire_payment_plan_installment_paid_automations() from anon;
revoke execute on function public.fire_payment_plan_installment_paid_automations() from authenticated;
revoke execute on function public.fire_pipeline_stage_entered_automations() from anon;
revoke execute on function public.fire_pipeline_stage_entered_automations() from authenticated;
revoke execute on function public.fire_quote_created_automations() from anon;
revoke execute on function public.fire_quote_created_automations() from authenticated;
revoke execute on function public.fire_quote_status_changed_automations() from anon;
revoke execute on function public.fire_quote_status_changed_automations() from authenticated;
revoke execute on function public.fire_service_interest_automations() from anon;
revoke execute on function public.fire_service_interest_automations() from authenticated;
revoke execute on function public.fire_sms_engagement_event_automations() from anon;
revoke execute on function public.fire_sms_engagement_event_automations() from authenticated;
revoke execute on function public.fire_task_completed_automations() from anon;
revoke execute on function public.fire_task_completed_automations() from authenticated;
revoke execute on function public.fire_task_created_automations() from anon;
revoke execute on function public.fire_task_created_automations() from authenticated;
revoke execute on function public.fire_task_overdue_automations() from anon;
revoke execute on function public.fire_task_overdue_automations() from authenticated;
revoke execute on function public.flip_lead_on_quote_acceptance() from anon;
revoke execute on function public.flip_lead_on_quote_acceptance() from authenticated;
revoke execute on function public.guard_delete_if_wired_to_automation() from anon;
revoke execute on function public.guard_delete_if_wired_to_automation() from authenticated;
revoke execute on function public.is_ai_sandbox_workspace(p_workspace_id uuid) from anon;
revoke execute on function public.is_ai_sandbox_workspace(p_workspace_id uuid) from authenticated;
revoke execute on function public.is_module_unlocked(p_module_id uuid, p_user_id uuid) from anon;
revoke execute on function public.is_module_unlocked(p_module_id uuid, p_user_id uuid) from authenticated;
revoke execute on function public.is_platform_ai_operator() from anon;
revoke execute on function public.is_platform_ai_operator() from authenticated;
revoke execute on function public.learning_hub_reachable_workspaces(p_owner_workspace_id uuid) from anon;
revoke execute on function public.learning_hub_reachable_workspaces(p_owner_workspace_id uuid) from authenticated;
revoke execute on function public.network_child_relationship_types(p_workspace_id uuid) from anon;
revoke execute on function public.network_child_relationship_types(p_workspace_id uuid) from authenticated;
revoke execute on function public.notify_admins_of_automation_failure() from anon;
revoke execute on function public.notify_admins_of_automation_failure() from authenticated;
revoke execute on function public.notify_appointment_booked_online() from anon;
revoke execute on function public.notify_appointment_booked_online() from authenticated;
revoke execute on function public.notify_client_of_quote_change() from anon;
revoke execute on function public.notify_client_of_quote_change() from authenticated;
revoke execute on function public.notify_invoice_paid() from anon;
revoke execute on function public.notify_invoice_paid() from authenticated;
revoke execute on function public.notify_organizer_information_request(p_request_id uuid, p_message text) from anon;
revoke execute on function public.notify_organizer_information_request(p_request_id uuid, p_message text) from authenticated;
revoke execute on function public.notify_organizer_reviewed() from anon;
revoke execute on function public.notify_organizer_reviewed() from authenticated;
revoke execute on function public.notify_payment_received() from anon;
revoke execute on function public.notify_payment_received() from authenticated;
revoke execute on function public.notify_staff_document_request_completed() from anon;
revoke execute on function public.notify_staff_document_request_completed() from authenticated;
revoke execute on function public.portal_client_id() from anon;
revoke execute on function public.portal_client_id() from authenticated;
revoke execute on function public.record_agent_evidence(p_run_id uuid, p_evidence_type text, p_payload jsonb, p_finding_id uuid, p_storage_path text) from anon;
revoke execute on function public.record_agent_evidence(p_run_id uuid, p_evidence_type text, p_payload jsonb, p_finding_id uuid, p_storage_path text) from authenticated;
revoke execute on function public.resolve_organizer_information_request(p_request_id uuid) from anon;
revoke execute on function public.resolve_organizer_information_request(p_request_id uuid) from authenticated;
revoke execute on function public.resolve_organizer_information_request_if_done() from anon;
revoke execute on function public.resolve_organizer_information_request_if_done() from authenticated;
revoke execute on function public.revoke_expired_portal_access() from anon;
revoke execute on function public.revoke_expired_portal_access() from authenticated;
revoke execute on function public.set_organizer_answer_review_status(p_answer_id uuid, p_status review_status, p_note text) from anon;
revoke execute on function public.set_organizer_answer_review_status(p_answer_id uuid, p_status review_status, p_note text) from authenticated;
revoke execute on function public.set_partner_onboarding_document_request(p_workspace_id uuid, p_onboarding_id uuid, p_document_request_id uuid) from anon;
revoke execute on function public.set_partner_onboarding_document_request(p_workspace_id uuid, p_onboarding_id uuid, p_document_request_id uuid) from authenticated;
revoke execute on function public.should_advance_wait_until_step(p_pending_id uuid) from anon;
revoke execute on function public.should_advance_wait_until_step(p_pending_id uuid) from authenticated;
revoke execute on function public.sync_client_emails_forward() from anon;
revoke execute on function public.sync_client_emails_forward() from authenticated;
revoke execute on function public.sync_client_phones_forward() from anon;
revoke execute on function public.sync_client_phones_forward() from authenticated;
revoke execute on function public.sync_client_primary_email() from anon;
revoke execute on function public.sync_client_primary_email() from authenticated;
revoke execute on function public.sync_client_primary_phone() from anon;
revoke execute on function public.sync_client_primary_phone() from authenticated;
revoke execute on function public.sync_client_relationships_from_answer_change() from anon;
revoke execute on function public.sync_client_relationships_from_answer_change() from authenticated;
revoke execute on function public.sync_client_relationships_from_organizer_submission() from anon;
revoke execute on function public.sync_client_relationships_from_organizer_submission() from authenticated;
revoke execute on function public.tag_client_on_invoice_paid() from anon;
revoke execute on function public.tag_client_on_invoice_paid() from authenticated;
revoke execute on function public.tag_client_on_invoice_sent() from anon;
revoke execute on function public.tag_client_on_invoice_sent() from authenticated;
revoke execute on function public.update_partner_onboarding_requirements(p_workspace_id uuid, p_onboarding_id uuid, p_agreement_required boolean, p_documents_required boolean, p_training_required boolean, p_bank_software_setup_required boolean) from anon;
revoke execute on function public.update_partner_onboarding_requirements(p_workspace_id uuid, p_onboarding_id uuid, p_agreement_required boolean, p_documents_required boolean, p_training_required boolean, p_bank_software_setup_required boolean) from authenticated;
revoke execute on function public.withdraw_partner_onboarding(p_workspace_id uuid, p_onboarding_id uuid, p_reason text) from anon;
revoke execute on function public.withdraw_partner_onboarding(p_workspace_id uuid, p_onboarding_id uuid, p_reason text) from authenticated;

-- Part 3: five RLS-enabled, zero-policy tables previously left with the
-- default anon/authenticated grants Supabase applies to every new table
-- (full SELECT/INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER). RLS with
-- no policies already default-denies every row for anon/authenticated today,
-- so this changes no current behavior -- it closes the gap where a future
-- policy addition, or RLS being toggled off by mistake, would otherwise
-- immediately expose these rows. Confirmed every one is written exclusively
-- through service-role code (lib/rateLimit.ts's checkRateLimit, the calendar-
-- sync/webhook cron routes) or through already-correctly-scoped RPC wrappers
-- (set_workspace_ghl_connection/disconnect_workspace_ghl, already anon:false/
-- authenticated:true) -- no application code selects/inserts/updates/deletes
-- these tables directly as anon or authenticated. service_role is untouched
-- (Supabase's service_role already bypasses RLS and keeps its own grants
-- regardless of anon/authenticated privileges).
--
-- appointment_external_events already has zero anon/authenticated table
-- grants (confirmed live) -- no statement needed for it.

revoke all privileges on table public.rate_limit_hits from anon, authenticated;
revoke all privileges on table public.workspace_ghl_connections from anon, authenticated;
revoke all privileges on table public.workspace_jotform_connections from anon, authenticated;
revoke all privileges on table public.workspace_partner_purchase_webhooks from anon, authenticated;
