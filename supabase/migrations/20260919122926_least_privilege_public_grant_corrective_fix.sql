-- ============================================================================
-- MIGRATION RECONCILIATION PHASE 1.8 -- RECOVERED FROM PRODUCTION
--
-- Did not previously exist in Git. Applied directly to production on
-- 2026-09-19 (recorded version 20260919122926, name
-- least_privilege_public_grant_corrective_fix in
-- supabase_migrations.schema_migrations) without ever being committed here.
-- Reproduced verbatim, byte-for-byte, from schema_migrations.statements
-- (36917 bytes, confirmed exact match). Confidence: A -- exact original
-- recovered. Filename uses the real recorded production version so tooling
-- never replays it against this project, while applying correctly on a
-- fresh project.
--
-- LINEAGE: this is the corrective fix that closed the actual leak in an
-- earlier, superseded two-pass attempt (least_privilege_security_definer_
-- cleanup at 20260919080830, and its "_full" completion at 20260919080928,
-- covering the same 99 functions below). Those two are NOT separately
-- recovered here -- they are Class C (superseded): PostgreSQL's default
-- PUBLIC execute grant on newly created functions is additive to any
-- anon-only revoke, so revoking only from anon (as those two did) left the
-- real hole open. This migration revokes from PUBLIC (the actual fix),
-- revokes from anon again (idempotent), and explicitly grants to
-- authenticated for all 99 functions below -- fully superseding and
-- subsuming the earlier two-pass state on its own, with no dependency on
-- them having been applied first. Recreating them as their own files would
-- add obsolete intermediate migrations with no fresh-database benefit.
--
-- CURRENT-STATE VERIFICATION (2026-09-20, read-only): re-checked
-- has_function_privilege for anon/authenticated/public against all 99
-- functions directly on production. 98 of 99 match this migration's
-- intended state exactly (authenticated: yes, anon/public: no). The one
-- exception is search_clients: production's live signature now has 14
-- parameters (p_client_type, p_has_email, p_has_phone were added by a
-- later, unrelated migration), not the 11-parameter signature this
-- migration's revoke/grant statements target. The 14-param function is a
-- DISTINCT function object (Postgres identifies functions by full
-- signature) that still carries Postgres's default ACL (PUBLIC/anon
-- execute) -- almost certainly because whatever later migration widened
-- its signature used DROP + CREATE rather than CREATE OR REPLACE, which
-- does not preserve prior grants/revokes. This is a real, currently-live,
-- out-of-scope gap this migration cannot close (the signature it targets
-- no longer exists) -- flagged here for separate follow-up, not fixed by
-- this recovery, and not fabricated or altered here per the reconciliation
-- rule against rewriting recovered security SQL unnecessarily.
-- ============================================================================
revoke execute on function public.acknowledge_automation_run(p_run_id uuid) from public;
revoke execute on function public.acknowledge_automation_run(p_run_id uuid) from anon;
grant execute on function public.acknowledge_automation_run(p_run_id uuid) to authenticated;
revoke execute on function public.add_client_address(p_client_id uuid, p_workspace_id uuid, p_street text, p_city text, p_state text, p_zip text, p_make_primary boolean, p_address_type text) from public;
revoke execute on function public.add_client_address(p_client_id uuid, p_workspace_id uuid, p_street text, p_city text, p_state text, p_zip text, p_make_primary boolean, p_address_type text) from anon;
grant execute on function public.add_client_address(p_client_id uuid, p_workspace_id uuid, p_street text, p_city text, p_state text, p_zip text, p_make_primary boolean, p_address_type text) to authenticated;
revoke execute on function public.add_client_email(p_client_id uuid, p_workspace_id uuid, p_email text, p_make_primary boolean, p_email_type text) from public;
revoke execute on function public.add_client_email(p_client_id uuid, p_workspace_id uuid, p_email text, p_make_primary boolean, p_email_type text) from anon;
grant execute on function public.add_client_email(p_client_id uuid, p_workspace_id uuid, p_email text, p_make_primary boolean, p_email_type text) to authenticated;
revoke execute on function public.add_client_phone(p_client_id uuid, p_workspace_id uuid, p_phone text, p_make_primary boolean, p_phone_type text) from public;
revoke execute on function public.add_client_phone(p_client_id uuid, p_workspace_id uuid, p_phone text, p_make_primary boolean, p_phone_type text) from anon;
grant execute on function public.add_client_phone(p_client_id uuid, p_workspace_id uuid, p_phone text, p_make_primary boolean, p_phone_type text) to authenticated;
revoke execute on function public.advance_pipeline_stage(p_entity_type text, p_entity_id uuid, p_process_id uuid, p_process_stage_id uuid) from public;
revoke execute on function public.advance_pipeline_stage(p_entity_type text, p_entity_id uuid, p_process_id uuid, p_process_stage_id uuid) from anon;
grant execute on function public.advance_pipeline_stage(p_entity_type text, p_entity_id uuid, p_process_id uuid, p_process_stage_id uuid) to authenticated;
revoke execute on function public.apply_manual_payment_to_installment(p_payment_id uuid, p_payment_plan_id uuid) from public;
revoke execute on function public.apply_manual_payment_to_installment(p_payment_id uuid, p_payment_plan_id uuid) from anon;
grant execute on function public.apply_manual_payment_to_installment(p_payment_id uuid, p_payment_plan_id uuid) to authenticated;
revoke execute on function public.approve_organizer_information_request_item(p_item_id uuid) from public;
revoke execute on function public.approve_organizer_information_request_item(p_item_id uuid) from anon;
grant execute on function public.approve_organizer_information_request_item(p_item_id uuid) to authenticated;
revoke execute on function public.assign_firm_package(p_connection_id uuid, p_package_id uuid) from public;
revoke execute on function public.assign_firm_package(p_connection_id uuid, p_package_id uuid) from anon;
grant execute on function public.assign_firm_package(p_connection_id uuid, p_package_id uuid) to authenticated;
revoke execute on function public.assign_learning_course(p_course_id uuid, p_user_id uuid, p_due_date date) from public;
revoke execute on function public.assign_learning_course(p_course_id uuid, p_user_id uuid, p_due_date date) from anon;
grant execute on function public.assign_learning_course(p_course_id uuid, p_user_id uuid, p_due_date date) to authenticated;
revoke execute on function public.attest_signature_presence(p_signer_id uuid) from public;
revoke execute on function public.attest_signature_presence(p_signer_id uuid) from anon;
grant execute on function public.attest_signature_presence(p_signer_id uuid) to authenticated;
revoke execute on function public.can_access_admin_ai() from public;
revoke execute on function public.can_access_admin_ai() from anon;
grant execute on function public.can_access_admin_ai() to authenticated;
revoke execute on function public.cancel_signature_request(p_signature_request_id uuid) from public;
revoke execute on function public.cancel_signature_request(p_signature_request_id uuid) from anon;
grant execute on function public.cancel_signature_request(p_signature_request_id uuid) to authenticated;
revoke execute on function public.create_engagement(p_workspace_id uuid, p_client_id uuid, p_service_id uuid, p_assigned_staff_id uuid, p_priority engagement_priority, p_process_id uuid, p_case_type text, p_due_date timestamp with time zone) from public;
revoke execute on function public.create_engagement(p_workspace_id uuid, p_client_id uuid, p_service_id uuid, p_assigned_staff_id uuid, p_priority engagement_priority, p_process_id uuid, p_case_type text, p_due_date timestamp with time zone) from anon;
grant execute on function public.create_engagement(p_workspace_id uuid, p_client_id uuid, p_service_id uuid, p_assigned_staff_id uuid, p_priority engagement_priority, p_process_id uuid, p_case_type text, p_due_date timestamp with time zone) to authenticated;
revoke execute on function public.create_manual_firm_connection(p_workspace_id uuid, p_relationship_type text, p_name text, p_owner_name text, p_phone text, p_email text, p_website text, p_address text, p_notes text) from public;
revoke execute on function public.create_manual_firm_connection(p_workspace_id uuid, p_relationship_type text, p_name text, p_owner_name text, p_phone text, p_email text, p_website text, p_address text, p_notes text) from anon;
grant execute on function public.create_manual_firm_connection(p_workspace_id uuid, p_relationship_type text, p_name text, p_owner_name text, p_phone text, p_email text, p_website text, p_address text, p_notes text) to authenticated;
revoke execute on function public.create_partner_onboarding(p_workspace_id uuid, p_firm_connection_id uuid, p_package_id uuid) from public;
revoke execute on function public.create_partner_onboarding(p_workspace_id uuid, p_firm_connection_id uuid, p_package_id uuid) from anon;
grant execute on function public.create_partner_onboarding(p_workspace_id uuid, p_firm_connection_id uuid, p_package_id uuid) to authenticated;
revoke execute on function public.decide_automation_step(p_pending_step_id uuid, p_decided_option text) from public;
revoke execute on function public.decide_automation_step(p_pending_step_id uuid, p_decided_option text) from anon;
grant execute on function public.decide_automation_step(p_pending_step_id uuid, p_decided_option text) to authenticated;
revoke execute on function public.delete_client_email(p_email_id uuid) from public;
revoke execute on function public.delete_client_email(p_email_id uuid) from anon;
grant execute on function public.delete_client_email(p_email_id uuid) to authenticated;
revoke execute on function public.delete_client_phone(p_phone_id uuid) from public;
revoke execute on function public.delete_client_phone(p_phone_id uuid) from anon;
grant execute on function public.delete_client_phone(p_phone_id uuid) to authenticated;
revoke execute on function public.delete_installed_template(p_workspace_id uuid, p_installation_id uuid) from public;
revoke execute on function public.delete_installed_template(p_workspace_id uuid, p_installation_id uuid) from anon;
grant execute on function public.delete_installed_template(p_workspace_id uuid, p_installation_id uuid) to authenticated;
revoke execute on function public.delete_workflow_pipeline(p_process_id uuid) from public;
revoke execute on function public.delete_workflow_pipeline(p_process_id uuid) from anon;
grant execute on function public.delete_workflow_pipeline(p_process_id uuid) to authenticated;
revoke execute on function public.duplicate_installed_template(p_workspace_id uuid, p_installation_id uuid, p_new_name text) from public;
revoke execute on function public.duplicate_installed_template(p_workspace_id uuid, p_installation_id uuid, p_new_name text) from anon;
grant execute on function public.duplicate_installed_template(p_workspace_id uuid, p_installation_id uuid, p_new_name text) to authenticated;
revoke execute on function public.engagement_has_signed_letter(p_engagement_id uuid) from public;
revoke execute on function public.engagement_has_signed_letter(p_engagement_id uuid) from anon;
grant execute on function public.engagement_has_signed_letter(p_engagement_id uuid) to authenticated;
revoke execute on function public.flag_organizer_field_for_info(p_organizer_response_id uuid, p_organizer_field_id uuid, p_instance_index integer, p_note text) from public;
revoke execute on function public.flag_organizer_field_for_info(p_organizer_response_id uuid, p_organizer_field_id uuid, p_instance_index integer, p_note text) from anon;
grant execute on function public.flag_organizer_field_for_info(p_organizer_response_id uuid, p_organizer_field_id uuid, p_instance_index integer, p_note text) to authenticated;
revoke execute on function public.generate_firm_payout(p_connection_id uuid, p_period_start date, p_period_end date) from public;
revoke execute on function public.generate_firm_payout(p_connection_id uuid, p_period_start date, p_period_end date) from anon;
grant execute on function public.generate_firm_payout(p_connection_id uuid, p_period_start date, p_period_end date) to authenticated;
revoke execute on function public.get_ero_connected_partners(p_workspace_id uuid, p_relationship_types text[]) from public;
revoke execute on function public.get_ero_connected_partners(p_workspace_id uuid, p_relationship_types text[]) from anon;
grant execute on function public.get_ero_connected_partners(p_workspace_id uuid, p_relationship_types text[]) to authenticated;
revoke execute on function public.get_ero_return_status(p_workspace_id uuid) from public;
revoke execute on function public.get_ero_return_status(p_workspace_id uuid) from anon;
grant execute on function public.get_ero_return_status(p_workspace_id uuid) to authenticated;
revoke execute on function public.get_ero_tax_year_metrics(p_workspace_id uuid) from public;
revoke execute on function public.get_ero_tax_year_metrics(p_workspace_id uuid) from anon;
grant execute on function public.get_ero_tax_year_metrics(p_workspace_id uuid) to authenticated;
revoke execute on function public.get_firm_production(p_connection_id uuid, p_period_start date, p_period_end date) from public;
revoke execute on function public.get_firm_production(p_connection_id uuid, p_period_start date, p_period_end date) from anon;
grant execute on function public.get_firm_production(p_connection_id uuid, p_period_start date, p_period_end date) to authenticated;
revoke execute on function public.get_learning_assignment_rollup(p_owner_workspace_id uuid) from public;
revoke execute on function public.get_learning_assignment_rollup(p_owner_workspace_id uuid) from anon;
grant execute on function public.get_learning_assignment_rollup(p_owner_workspace_id uuid) to authenticated;
revoke execute on function public.get_learning_completion_rollup(p_owner_workspace_id uuid) from public;
revoke execute on function public.get_learning_completion_rollup(p_owner_workspace_id uuid) from anon;
grant execute on function public.get_learning_completion_rollup(p_owner_workspace_id uuid) to authenticated;
revoke execute on function public.get_my_partner_onboarding(p_workspace_id uuid) from public;
revoke execute on function public.get_my_partner_onboarding(p_workspace_id uuid) from anon;
grant execute on function public.get_my_partner_onboarding(p_workspace_id uuid) to authenticated;
revoke execute on function public.get_my_sponsorship_transition() from public;
revoke execute on function public.get_my_sponsorship_transition() from anon;
grant execute on function public.get_my_sponsorship_transition() to authenticated;
revoke execute on function public.get_network_bank_software_distribution(p_workspace_id uuid) from public;
revoke execute on function public.get_network_bank_software_distribution(p_workspace_id uuid) from anon;
grant execute on function public.get_network_bank_software_distribution(p_workspace_id uuid) to authenticated;
revoke execute on function public.get_network_filing_volume(p_workspace_id uuid, p_tax_year integer) from public;
revoke execute on function public.get_network_filing_volume(p_workspace_id uuid, p_tax_year integer) from anon;
grant execute on function public.get_network_filing_volume(p_workspace_id uuid, p_tax_year integer) to authenticated;
revoke execute on function public.get_network_package_revenue(p_workspace_id uuid) from public;
revoke execute on function public.get_network_package_revenue(p_workspace_id uuid) from anon;
grant execute on function public.get_network_package_revenue(p_workspace_id uuid) to authenticated;
revoke execute on function public.get_network_partner_production(p_workspace_id uuid, p_period_start date, p_period_end date, p_sort_by text) from public;
revoke execute on function public.get_network_partner_production(p_workspace_id uuid, p_period_start date, p_period_end date, p_sort_by text) from anon;
grant execute on function public.get_network_partner_production(p_workspace_id uuid, p_period_start date, p_period_end date, p_sort_by text) to authenticated;
revoke execute on function public.get_network_payout_export(p_workspace_id uuid, p_period_start date, p_period_end date, p_status text) from public;
revoke execute on function public.get_network_payout_export(p_workspace_id uuid, p_period_start date, p_period_end date, p_status text) from anon;
grant execute on function public.get_network_payout_export(p_workspace_id uuid, p_period_start date, p_period_end date, p_status text) to authenticated;
revoke execute on function public.get_network_payout_summary(p_workspace_id uuid) from public;
revoke execute on function public.get_network_payout_summary(p_workspace_id uuid) from anon;
grant execute on function public.get_network_payout_summary(p_workspace_id uuid) to authenticated;
revoke execute on function public.get_network_production(p_workspace_id uuid, p_period_start date, p_period_end date) from public;
revoke execute on function public.get_network_production(p_workspace_id uuid, p_period_start date, p_period_end date) from anon;
grant execute on function public.get_network_production(p_workspace_id uuid, p_period_start date, p_period_end date) to authenticated;
revoke execute on function public.get_network_revenue_share(p_workspace_id uuid, p_period_start date, p_period_end date) from public;
revoke execute on function public.get_network_revenue_share(p_workspace_id uuid, p_period_start date, p_period_end date) from anon;
grant execute on function public.get_network_revenue_share(p_workspace_id uuid, p_period_start date, p_period_end date) to authenticated;
revoke execute on function public.get_network_review_status_summary(p_workspace_id uuid) from public;
revoke execute on function public.get_network_review_status_summary(p_workspace_id uuid) from anon;
grant execute on function public.get_network_review_status_summary(p_workspace_id uuid) to authenticated;
revoke execute on function public.get_portal_client_contact() from public;
revoke execute on function public.get_portal_client_contact() from anon;
grant execute on function public.get_portal_client_contact() to authenticated;
revoke execute on function public.get_quiz_for_taking(p_module_id uuid) from public;
revoke execute on function public.get_quiz_for_taking(p_module_id uuid) from anon;
grant execute on function public.get_quiz_for_taking(p_module_id uuid) to authenticated;
revoke execute on function public.get_site_page_preview(p_page_id uuid) from public;
revoke execute on function public.get_site_page_preview(p_page_id uuid) from anon;
grant execute on function public.get_site_page_preview(p_page_id uuid) to authenticated;
revoke execute on function public.get_workspace_member_emails(p_workspace_id uuid) from public;
revoke execute on function public.get_workspace_member_emails(p_workspace_id uuid) from anon;
grant execute on function public.get_workspace_member_emails(p_workspace_id uuid) to authenticated;
revoke execute on function public.get_workspace_tags(p_workspace_id uuid) from public;
revoke execute on function public.get_workspace_tags(p_workspace_id uuid) from anon;
grant execute on function public.get_workspace_tags(p_workspace_id uuid) to authenticated;
revoke execute on function public.import_bank_product_transactions(p_workspace_id uuid, p_rows jsonb) from public;
revoke execute on function public.import_bank_product_transactions(p_workspace_id uuid, p_rows jsonb) from anon;
grant execute on function public.import_bank_product_transactions(p_workspace_id uuid, p_rows jsonb) to authenticated;
revoke execute on function public.install_marketplace_template(p_workspace_id uuid, p_marketplace_template_id uuid, p_name text) from public;
revoke execute on function public.install_marketplace_template(p_workspace_id uuid, p_marketplace_template_id uuid, p_name text) from anon;
grant execute on function public.install_marketplace_template(p_workspace_id uuid, p_marketplace_template_id uuid, p_name text) to authenticated;
revoke execute on function public.list_marketplace_templates(p_workspace_id uuid) from public;
revoke execute on function public.list_marketplace_templates(p_workspace_id uuid) from anon;
grant execute on function public.list_marketplace_templates(p_workspace_id uuid) to authenticated;
revoke execute on function public.list_partner_onboardings(p_workspace_id uuid) from public;
revoke execute on function public.list_partner_onboardings(p_workspace_id uuid) from anon;
grant execute on function public.list_partner_onboardings(p_workspace_id uuid) to authenticated;
revoke execute on function public.list_workspace_templates(p_workspace_id uuid) from public;
revoke execute on function public.list_workspace_templates(p_workspace_id uuid) from anon;
grant execute on function public.list_workspace_templates(p_workspace_id uuid) to authenticated;
revoke execute on function public.mark_client_lost(p_client_id uuid, p_reason text) from public;
revoke execute on function public.mark_client_lost(p_client_id uuid, p_reason text) from anon;
grant execute on function public.mark_client_lost(p_client_id uuid, p_reason text) to authenticated;
revoke execute on function public.mark_document_request_reviewed(p_document_request_id uuid) from public;
revoke execute on function public.mark_document_request_reviewed(p_document_request_id uuid) from anon;
grant execute on function public.mark_document_request_reviewed(p_document_request_id uuid) to authenticated;
revoke execute on function public.mark_firm_payout_paid(p_payout_id uuid, p_payment_note text) from public;
revoke execute on function public.mark_firm_payout_paid(p_payout_id uuid, p_payment_note text) from anon;
grant execute on function public.mark_firm_payout_paid(p_payout_id uuid, p_payment_note text) to authenticated;
revoke execute on function public.mark_lesson_complete(p_module_id uuid) from public;
revoke execute on function public.mark_lesson_complete(p_module_id uuid) from anon;
grant execute on function public.mark_lesson_complete(p_module_id uuid) to authenticated;
revoke execute on function public.mark_organizer_information_request_responded(p_request_id uuid) from public;
revoke execute on function public.mark_organizer_information_request_responded(p_request_id uuid) from anon;
grant execute on function public.mark_organizer_information_request_responded(p_request_id uuid) to authenticated;
revoke execute on function public.mark_organizer_information_request_viewed(p_request_id uuid) from public;
revoke execute on function public.mark_organizer_information_request_viewed(p_request_id uuid) from anon;
grant execute on function public.mark_organizer_information_request_viewed(p_request_id uuid) to authenticated;
revoke execute on function public.notify_staff_organizer_information_responded(p_response_id uuid, p_item_count integer) from public;
revoke execute on function public.notify_staff_organizer_information_responded(p_response_id uuid, p_item_count integer) from anon;
grant execute on function public.notify_staff_organizer_information_responded(p_response_id uuid, p_item_count integer) to authenticated;
revoke execute on function public.propose_client_sensitive_field(p_field text, p_new_value text, p_organizer_response_id uuid, p_organizer_field_id uuid) from public;
revoke execute on function public.propose_client_sensitive_field(p_field text, p_new_value text, p_organizer_response_id uuid, p_organizer_field_id uuid) from anon;
grant execute on function public.propose_client_sensitive_field(p_field text, p_new_value text, p_organizer_response_id uuid, p_organizer_field_id uuid) to authenticated;
revoke execute on function public.propose_organizer_answer_correction(p_item_id uuid, p_proposed_value jsonb) from public;
revoke execute on function public.propose_organizer_answer_correction(p_item_id uuid, p_proposed_value jsonb) from anon;
grant execute on function public.propose_organizer_answer_correction(p_item_id uuid, p_proposed_value jsonb) to authenticated;
revoke execute on function public.record_organizer_response_activity() from public;
revoke execute on function public.record_organizer_response_activity() from anon;
grant execute on function public.record_organizer_response_activity() to authenticated;
revoke execute on function public.record_partner_onboarding_review(p_workspace_id uuid, p_onboarding_id uuid, p_decision text, p_note text) from public;
revoke execute on function public.record_partner_onboarding_review(p_workspace_id uuid, p_onboarding_id uuid, p_decision text, p_note text) from anon;
grant execute on function public.record_partner_onboarding_review(p_workspace_id uuid, p_onboarding_id uuid, p_decision text, p_note text) to authenticated;
revoke execute on function public.reject_organizer_information_request_item(p_item_id uuid, p_decision_note text) from public;
revoke execute on function public.reject_organizer_information_request_item(p_item_id uuid, p_decision_note text) from anon;
grant execute on function public.reject_organizer_information_request_item(p_item_id uuid, p_decision_note text) to authenticated;
revoke execute on function public.release_sponsored_staff_member(p_workspace_id uuid, p_user_id uuid) from public;
revoke execute on function public.release_sponsored_staff_member(p_workspace_id uuid, p_user_id uuid) from anon;
grant execute on function public.release_sponsored_staff_member(p_workspace_id uuid, p_user_id uuid) to authenticated;
revoke execute on function public.reorder_funnel_pages(p_funnel_id uuid, p_page_ids uuid[]) from public;
revoke execute on function public.reorder_funnel_pages(p_funnel_id uuid, p_page_ids uuid[]) from anon;
grant execute on function public.reorder_funnel_pages(p_funnel_id uuid, p_page_ids uuid[]) to authenticated;
revoke execute on function public.reorder_process_stage(p_stage_id uuid, p_direction text) from public;
revoke execute on function public.reorder_process_stage(p_stage_id uuid, p_direction text) from anon;
grant execute on function public.reorder_process_stage(p_stage_id uuid, p_direction text) to authenticated;
revoke execute on function public.reorder_site_page_sections(p_page_id uuid, p_section_ids uuid[]) from public;
revoke execute on function public.reorder_site_page_sections(p_page_id uuid, p_section_ids uuid[]) from anon;
grant execute on function public.reorder_site_page_sections(p_page_id uuid, p_section_ids uuid[]) to authenticated;
revoke execute on function public.reorder_site_popup_sections(p_popup_id uuid, p_section_ids uuid[]) from public;
revoke execute on function public.reorder_site_popup_sections(p_popup_id uuid, p_section_ids uuid[]) from anon;
grant execute on function public.reorder_site_popup_sections(p_popup_id uuid, p_section_ids uuid[]) to authenticated;
revoke execute on function public.request_finding_autofix(p_finding_id uuid) from public;
revoke execute on function public.request_finding_autofix(p_finding_id uuid) from anon;
grant execute on function public.request_finding_autofix(p_finding_id uuid) to authenticated;
revoke execute on function public.reveal_firm_caf(p_workspace_id uuid) from public;
revoke execute on function public.reveal_firm_caf(p_workspace_id uuid) from anon;
grant execute on function public.reveal_firm_caf(p_workspace_id uuid) to authenticated;
revoke execute on function public.run_automation_test(p_automation_id uuid, p_client_id uuid, p_engagement_id uuid) from public;
revoke execute on function public.run_automation_test(p_automation_id uuid, p_client_id uuid, p_engagement_id uuid) from anon;
grant execute on function public.run_automation_test(p_automation_id uuid, p_client_id uuid, p_engagement_id uuid) to authenticated;
revoke execute on function public.save_organizer_dynamic_required_answer(p_response_id uuid, p_organizer_field_id uuid, p_value jsonb) from public;
revoke execute on function public.save_organizer_dynamic_required_answer(p_response_id uuid, p_organizer_field_id uuid, p_value jsonb) from anon;
grant execute on function public.save_organizer_dynamic_required_answer(p_response_id uuid, p_organizer_field_id uuid, p_value jsonb) to authenticated;
revoke execute on function public.save_organizer_reopened_field_answer(p_item_id uuid, p_value jsonb) from public;
revoke execute on function public.save_organizer_reopened_field_answer(p_item_id uuid, p_value jsonb) from anon;
grant execute on function public.save_organizer_reopened_field_answer(p_item_id uuid, p_value jsonb) to authenticated;
revoke execute on function public.search_clients(p_workspace_id uuid, p_query text, p_lifecycle_statuses text[], p_tag text, p_service_id uuid, p_assigned_staff_id uuid, p_pipeline_stage_name text, p_missing_documents boolean, p_outstanding_balance boolean, p_limit integer, p_offset integer) from public;
revoke execute on function public.search_clients(p_workspace_id uuid, p_query text, p_lifecycle_statuses text[], p_tag text, p_service_id uuid, p_assigned_staff_id uuid, p_pipeline_stage_name text, p_missing_documents boolean, p_outstanding_balance boolean, p_limit integer, p_offset integer) from anon;
grant execute on function public.search_clients(p_workspace_id uuid, p_query text, p_lifecycle_statuses text[], p_tag text, p_service_id uuid, p_assigned_staff_id uuid, p_pipeline_stage_name text, p_missing_documents boolean, p_outstanding_balance boolean, p_limit integer, p_offset integer) to authenticated;
revoke execute on function public.send_organizer_information_request(p_request_id uuid, p_message text, p_due_date date, p_tags text[], p_send_email boolean, p_send_sms boolean, p_show_in_portal boolean) from public;
revoke execute on function public.send_organizer_information_request(p_request_id uuid, p_message text, p_due_date date, p_tags text[], p_send_email boolean, p_send_sms boolean, p_show_in_portal boolean) from anon;
grant execute on function public.send_organizer_information_request(p_request_id uuid, p_message text, p_due_date date, p_tags text[], p_send_email boolean, p_send_sms boolean, p_show_in_portal boolean) to authenticated;
revoke execute on function public.send_organizer_to_ero_review(p_response_id uuid) from public;
revoke execute on function public.send_organizer_to_ero_review(p_response_id uuid) from anon;
grant execute on function public.send_organizer_to_ero_review(p_response_id uuid) to authenticated;
revoke execute on function public.set_agent_finding_status(p_finding_id uuid, p_status text, p_decision_notes text) from public;
revoke execute on function public.set_agent_finding_status(p_finding_id uuid, p_status text, p_decision_notes text) from anon;
grant execute on function public.set_agent_finding_status(p_finding_id uuid, p_status text, p_decision_notes text) to authenticated;
revoke execute on function public.set_client_address_primary(p_address_id uuid) from public;
revoke execute on function public.set_client_address_primary(p_address_id uuid) from anon;
grant execute on function public.set_client_address_primary(p_address_id uuid) to authenticated;
revoke execute on function public.set_client_email_primary(p_email_id uuid) from public;
revoke execute on function public.set_client_email_primary(p_email_id uuid) from anon;
grant execute on function public.set_client_email_primary(p_email_id uuid) to authenticated;
revoke execute on function public.set_client_phone_primary(p_phone_id uuid) from public;
revoke execute on function public.set_client_phone_primary(p_phone_id uuid) from anon;
grant execute on function public.set_client_phone_primary(p_phone_id uuid) to authenticated;
revoke execute on function public.set_client_task_completed(p_task_id uuid, p_completed boolean) from public;
revoke execute on function public.set_client_task_completed(p_task_id uuid, p_completed boolean) from anon;
grant execute on function public.set_client_task_completed(p_task_id uuid, p_completed boolean) to authenticated;
revoke execute on function public.set_finding_autofix_result(p_finding_id uuid, p_autofix_status text, p_note text) from public;
revoke execute on function public.set_finding_autofix_result(p_finding_id uuid, p_autofix_status text, p_note text) from anon;
grant execute on function public.set_finding_autofix_result(p_finding_id uuid, p_autofix_status text, p_note text) to authenticated;
revoke execute on function public.set_firm_tax_profile(p_workspace_id uuid, p_ein text, p_efin text, p_ptin text, p_clear_ein boolean, p_clear_efin boolean, p_clear_ptin boolean, p_supported_filing_states text[], p_regular_office_hours jsonb, p_tax_season_hours jsonb, p_caf text, p_clear_caf boolean) from public;
revoke execute on function public.set_firm_tax_profile(p_workspace_id uuid, p_ein text, p_efin text, p_ptin text, p_clear_ein boolean, p_clear_efin boolean, p_clear_ptin boolean, p_supported_filing_states text[], p_regular_office_hours jsonb, p_tax_season_hours jsonb, p_caf text, p_clear_caf boolean) from anon;
grant execute on function public.set_firm_tax_profile(p_workspace_id uuid, p_ein text, p_efin text, p_ptin text, p_clear_ein boolean, p_clear_efin boolean, p_clear_ptin boolean, p_supported_filing_states text[], p_regular_office_hours jsonb, p_tax_season_hours jsonb, p_caf text, p_clear_caf boolean) to authenticated;
revoke execute on function public.set_installed_template_enabled(p_workspace_id uuid, p_installation_id uuid, p_enabled boolean) from public;
revoke execute on function public.set_installed_template_enabled(p_workspace_id uuid, p_installation_id uuid, p_enabled boolean) from anon;
grant execute on function public.set_installed_template_enabled(p_workspace_id uuid, p_installation_id uuid, p_enabled boolean) to authenticated;
revoke execute on function public.set_partner_onboarding_agreement_request(p_workspace_id uuid, p_onboarding_id uuid, p_signature_request_id uuid) from public;
revoke execute on function public.set_partner_onboarding_agreement_request(p_workspace_id uuid, p_onboarding_id uuid, p_signature_request_id uuid) from anon;
grant execute on function public.set_partner_onboarding_agreement_request(p_workspace_id uuid, p_onboarding_id uuid, p_signature_request_id uuid) to authenticated;
revoke execute on function public.set_partner_onboarding_bank_software_setup(p_workspace_id uuid, p_onboarding_id uuid, p_completed boolean) from public;
revoke execute on function public.set_partner_onboarding_bank_software_setup(p_workspace_id uuid, p_onboarding_id uuid, p_completed boolean) from anon;
grant execute on function public.set_partner_onboarding_bank_software_setup(p_workspace_id uuid, p_onboarding_id uuid, p_completed boolean) to authenticated;
revoke execute on function public.set_partner_onboarding_training(p_workspace_id uuid, p_onboarding_id uuid, p_completed boolean, p_learning_course_id uuid) from public;
revoke execute on function public.set_partner_onboarding_training(p_workspace_id uuid, p_onboarding_id uuid, p_completed boolean, p_learning_course_id uuid) from anon;
grant execute on function public.set_partner_onboarding_training(p_workspace_id uuid, p_onboarding_id uuid, p_completed boolean, p_learning_course_id uuid) to authenticated;
revoke execute on function public.set_platform_ai_operator(p_user_email text, p_is_platform_ai_operator boolean) from public;
revoke execute on function public.set_platform_ai_operator(p_user_email text, p_is_platform_ai_operator boolean) from anon;
grant execute on function public.set_platform_ai_operator(p_user_email text, p_is_platform_ai_operator boolean) to authenticated;
revoke execute on function public.set_platform_ai_operator_by_id(p_user_id uuid, p_is_platform_ai_operator boolean) from public;
revoke execute on function public.set_platform_ai_operator_by_id(p_user_id uuid, p_is_platform_ai_operator boolean) from anon;
grant execute on function public.set_platform_ai_operator_by_id(p_user_id uuid, p_is_platform_ai_operator boolean) to authenticated;
revoke execute on function public.set_signature_request_expiry(p_signature_request_id uuid, p_expires_at timestamp with time zone) from public;
revoke execute on function public.set_signature_request_expiry(p_signature_request_id uuid, p_expires_at timestamp with time zone) from anon;
grant execute on function public.set_signature_request_expiry(p_signature_request_id uuid, p_expires_at timestamp with time zone) to authenticated;
revoke execute on function public.start_agent_run(p_agent_key text, p_workspace_id uuid, p_run_type text, p_scope jsonb, p_objective text) from public;
revoke execute on function public.start_agent_run(p_agent_key text, p_workspace_id uuid, p_run_type text, p_scope jsonb, p_objective text) from anon;
grant execute on function public.start_agent_run(p_agent_key text, p_workspace_id uuid, p_run_type text, p_scope jsonb, p_objective text) to authenticated;
revoke execute on function public.start_personal_billing_setup() from public;
revoke execute on function public.start_personal_billing_setup() from anon;
grant execute on function public.start_personal_billing_setup() to authenticated;
revoke execute on function public.submit_partner_onboarding_application(p_workspace_id uuid, p_onboarding_id uuid, p_application_data jsonb) from public;
revoke execute on function public.submit_partner_onboarding_application(p_workspace_id uuid, p_onboarding_id uuid, p_application_data jsonb) from anon;
grant execute on function public.submit_partner_onboarding_application(p_workspace_id uuid, p_onboarding_id uuid, p_application_data jsonb) to authenticated;
revoke execute on function public.submit_quiz_attempt(p_module_id uuid, p_answers jsonb) from public;
revoke execute on function public.submit_quiz_attempt(p_module_id uuid, p_answers jsonb) from anon;
grant execute on function public.submit_quiz_attempt(p_module_id uuid, p_answers jsonb) to authenticated;
revoke execute on function public.unassign_learning_course(p_course_id uuid, p_user_id uuid) from public;
revoke execute on function public.unassign_learning_course(p_course_id uuid, p_user_id uuid) from anon;
grant execute on function public.unassign_learning_course(p_course_id uuid, p_user_id uuid) to authenticated;
revoke execute on function public.unflag_organizer_information_request_item(p_item_id uuid) from public;
revoke execute on function public.unflag_organizer_information_request_item(p_item_id uuid) from anon;
grant execute on function public.unflag_organizer_information_request_item(p_item_id uuid) to authenticated;
revoke execute on function public.update_agent_finding_status(p_finding_id uuid, p_status text, p_decision_notes text) from public;
revoke execute on function public.update_agent_finding_status(p_finding_id uuid, p_status text, p_decision_notes text) from anon;
grant execute on function public.update_agent_finding_status(p_finding_id uuid, p_status text, p_decision_notes text) to authenticated;
revoke execute on function public.update_manual_firm_connection(p_connection_id uuid, p_name text, p_owner_name text, p_phone text, p_email text, p_website text, p_address text) from public;
revoke execute on function public.update_manual_firm_connection(p_connection_id uuid, p_name text, p_owner_name text, p_phone text, p_email text, p_website text, p_address text) from anon;
grant execute on function public.update_manual_firm_connection(p_connection_id uuid, p_name text, p_owner_name text, p_phone text, p_email text, p_website text, p_address text) to authenticated;
revoke execute on function public.validate_automation(p_automation_id uuid) from public;
revoke execute on function public.validate_automation(p_automation_id uuid) from anon;
grant execute on function public.validate_automation(p_automation_id uuid) to authenticated;