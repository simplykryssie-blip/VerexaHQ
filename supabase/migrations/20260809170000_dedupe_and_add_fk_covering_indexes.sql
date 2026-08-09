-- Drop redundant duplicate indexes (identical definitions, keep the older/canonical name).
DROP INDEX IF EXISTS public.idx_activity_entity;
DROP INDEX IF EXISTS public.idx_dashboards_workspace;

-- Add covering indexes for foreign keys the advisor flagged as unindexed.
-- Postgres does not auto-index FK columns; missing coverage forces a seq scan
-- on the referencing table for every parent-row update/delete (FK check) and
-- for any join/filter on these columns.
CREATE INDEX IF NOT EXISTS idx_appointments_created_by ON public.appointments (created_by);
CREATE INDEX IF NOT EXISTS idx_automation_steps_approver_role_id ON public.automation_steps (approver_role_id);
CREATE INDEX IF NOT EXISTS idx_automations_created_by ON public.automations (created_by);
CREATE INDEX IF NOT EXISTS idx_billing_rules_created_by ON public.billing_rules (created_by);
CREATE INDEX IF NOT EXISTS idx_blueprints_created_by ON public.blueprints (created_by);
CREATE INDEX IF NOT EXISTS idx_blueprints_source_blueprint_id ON public.blueprints (source_blueprint_id);
CREATE INDEX IF NOT EXISTS idx_change_orders_approved_by ON public.change_orders (approved_by);
CREATE INDEX IF NOT EXISTS idx_change_orders_created_by ON public.change_orders (created_by);
CREATE INDEX IF NOT EXISTS idx_clients_created_by ON public.clients (created_by);
CREATE INDEX IF NOT EXISTS idx_clients_merged_into_client_id ON public.clients (merged_into_client_id);
CREATE INDEX IF NOT EXISTS idx_config_object_shares_responded_by ON public.config_object_shares (responded_by);
CREATE INDEX IF NOT EXISTS idx_config_object_shares_shared_by ON public.config_object_shares (shared_by);
CREATE INDEX IF NOT EXISTS idx_config_object_versions_changed_by ON public.config_object_versions (changed_by);
CREATE INDEX IF NOT EXISTS idx_dashboards_created_by ON public.dashboards (created_by);
CREATE INDEX IF NOT EXISTS idx_document_folder_templates_created_by ON public.document_folder_templates (created_by);
CREATE INDEX IF NOT EXISTS idx_document_folders_created_by ON public.document_folders (created_by);
CREATE INDEX IF NOT EXISTS idx_document_request_templates_created_by ON public.document_request_templates (created_by);
CREATE INDEX IF NOT EXISTS idx_document_requests_created_by ON public.document_requests (created_by);
CREATE INDEX IF NOT EXISTS idx_document_requests_document_request_template_id ON public.document_requests (document_request_template_id);
CREATE INDEX IF NOT EXISTS idx_email_templates_created_by ON public.email_templates (created_by);
CREATE INDEX IF NOT EXISTS idx_engagement_letter_templates_created_by ON public.engagement_letter_templates (created_by);
CREATE INDEX IF NOT EXISTS idx_engagement_pricing_created_by ON public.engagement_pricing (created_by);
CREATE INDEX IF NOT EXISTS idx_engagement_tax_details_original_engagement_id ON public.engagement_tax_details (original_engagement_id);
CREATE INDEX IF NOT EXISTS idx_firm_connections_invited_by ON public.firm_connections (invited_by);
CREATE INDEX IF NOT EXISTS idx_firm_connections_responded_by ON public.firm_connections (responded_by);
CREATE INDEX IF NOT EXISTS idx_firm_onboarding_selected_blueprint_id ON public.firm_onboarding (selected_blueprint_id);
CREATE INDEX IF NOT EXISTS idx_firm_tax_profile_updated_by ON public.firm_tax_profile (updated_by);
CREATE INDEX IF NOT EXISTS idx_invoices_created_by ON public.invoices (created_by);
CREATE INDEX IF NOT EXISTS idx_irs_notices_created_by ON public.irs_notices (created_by);
CREATE INDEX IF NOT EXISTS idx_message_threads_created_by ON public.message_threads (created_by);
CREATE INDEX IF NOT EXISTS idx_notification_preferences_workspace_id ON public.notification_preferences (workspace_id);
CREATE INDEX IF NOT EXISTS idx_organizer_response_answers_organizer_field_id ON public.organizer_response_answers (organizer_field_id);
CREATE INDEX IF NOT EXISTS idx_organizer_responses_organizer_template_id ON public.organizer_responses (organizer_template_id);
CREATE INDEX IF NOT EXISTS idx_organizer_responses_reviewed_by ON public.organizer_responses (reviewed_by);
CREATE INDEX IF NOT EXISTS idx_organizer_templates_created_by ON public.organizer_templates (created_by);
CREATE INDEX IF NOT EXISTS idx_payment_plans_created_by ON public.payment_plans (created_by);
CREATE INDEX IF NOT EXISTS idx_payments_recorded_by ON public.payments (recorded_by);
CREATE INDEX IF NOT EXISTS idx_pipelines_created_by ON public.pipelines (created_by);
CREATE INDEX IF NOT EXISTS idx_pricing_rules_created_by ON public.pricing_rules (created_by);
CREATE INDEX IF NOT EXISTS idx_process_stages_reviewer_role_id ON public.process_stages (reviewer_role_id);
CREATE INDEX IF NOT EXISTS idx_process_tasks_assignee_role_id ON public.process_tasks (assignee_role_id);
CREATE INDEX IF NOT EXISTS idx_processes_created_by ON public.processes (created_by);
CREATE INDEX IF NOT EXISTS idx_quotes_created_by ON public.quotes (created_by);
CREATE INDEX IF NOT EXISTS idx_recurring_billing_created_by ON public.recurring_billing (created_by);
CREATE INDEX IF NOT EXISTS idx_services_billing_rule_id ON public.services (billing_rule_id);
CREATE INDEX IF NOT EXISTS idx_services_created_by ON public.services (created_by);
CREATE INDEX IF NOT EXISTS idx_services_document_folder_template_id ON public.services (document_folder_template_id);
CREATE INDEX IF NOT EXISTS idx_services_document_request_template_id ON public.services (document_request_template_id);
CREATE INDEX IF NOT EXISTS idx_services_engagement_letter_template_id ON public.services (engagement_letter_template_id);
CREATE INDEX IF NOT EXISTS idx_services_organizer_template_id ON public.services (organizer_template_id);
CREATE INDEX IF NOT EXISTS idx_services_pipeline_id ON public.services (pipeline_id);
CREATE INDEX IF NOT EXISTS idx_services_pricing_rule_id ON public.services (pricing_rule_id);
CREATE INDEX IF NOT EXISTS idx_services_process_id ON public.services (process_id);
CREATE INDEX IF NOT EXISTS idx_signature_requests_created_by ON public.signature_requests (created_by);
CREATE INDEX IF NOT EXISTS idx_sms_templates_created_by ON public.sms_templates (created_by);
CREATE INDEX IF NOT EXISTS idx_user_widget_preferences_dashboard_widget_id ON public.user_widget_preferences (dashboard_widget_id);
CREATE INDEX IF NOT EXISTS idx_workspace_retention_policies_updated_by ON public.workspace_retention_policies (updated_by);
CREATE INDEX IF NOT EXISTS idx_workspace_security_policies_updated_by ON public.workspace_security_policies (updated_by);
CREATE INDEX IF NOT EXISTS idx_workspace_subscription_invoices_workspace_id ON public.workspace_subscription_invoices (workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_subscriptions_plan_id ON public.workspace_subscriptions (plan_id);