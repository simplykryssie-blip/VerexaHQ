-- Migration Reconciliation Phase 1.10A -- recovered from production.
--
-- Reverified against Phase 1.8's classification: production actually applied
-- this in three steps on 2026-09-19 --
-- least_privilege_security_definer_cleanup (080830, 11 functions),
-- least_privilege_security_definer_cleanup_full (this file, 080928, the
-- same 99-function Group A list from the p18 regression test's v_group_a
-- array), and least_privilege_security_definer_cleanup_part2 (081528, the
-- 86-function Group B list). The first step's 11 revokes are a strict
-- subset of this file's 99 -- superseded/obsolete as a fresh-database
-- migration, intentionally NOT recovered separately (revoking twice is a
-- harmless no-op, but recreating the redundant intermediate file adds
-- nothing and this phase was told not to recreate obsolete intermediate
-- security states).
--
-- Confidence: A -- exact original recovered from
-- supabase_migrations.schema_migrations.statements (byte-for-byte).
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
