-- Part A: wrap auth.uid() in (select auth.uid()) so Postgres evaluates it

-- once per query (InitPlan) instead of once per row. Same result set, cheaper eval.

ALTER POLICY provider_status_select ON public.provider_status
  USING (((select auth.uid()) IS NOT NULL));

ALTER POLICY notification_preferences_select ON public.notification_preferences
  USING ((user_id = (select auth.uid())));

ALTER POLICY notification_preferences_insert ON public.notification_preferences
  WITH CHECK ((user_id = (select auth.uid())));

ALTER POLICY notification_preferences_update ON public.notification_preferences
  USING ((user_id = (select auth.uid())))
  WITH CHECK ((user_id = (select auth.uid())));

ALTER POLICY notification_preferences_delete ON public.notification_preferences
  USING ((user_id = (select auth.uid())));

ALTER POLICY user_widget_preferences_select ON public.user_widget_preferences
  USING ((user_id = (select auth.uid())));

ALTER POLICY user_widget_preferences_insert ON public.user_widget_preferences
  WITH CHECK ((user_id = (select auth.uid())));

ALTER POLICY user_widget_preferences_update ON public.user_widget_preferences
  USING ((user_id = (select auth.uid())))
  WITH CHECK ((user_id = (select auth.uid())));

ALTER POLICY user_widget_preferences_delete ON public.user_widget_preferences
  USING ((user_id = (select auth.uid())));

ALTER POLICY user_zoom_connections_select ON public.user_zoom_connections
  USING ((user_id = (select auth.uid())));



-- Part B: consolidate redundant permissive policy pairs (one staff-facing,

-- one portal-facing) into a single policy per (table, command) with an OR'd

-- condition. Postgres already OR's multiple permissive policies together for

-- the same role+command, so this is a pure restatement of existing behavior --

-- not a new access decision -- that removes the double policy-function-call

-- overhead per row. auth.uid() calls inlined from absorbed policies are wrapped

-- in (select ...) at the same time (these were also flagged individually).

--

-- Skipped: firm_onboarding_select / platform_subscription_plans_select. Both

-- pair with an ALL-scoped admin policy; merging would require splitting that

-- ALL policy into per-command policies (real structural risk) for negligible

-- benefit -- platform_subscription_plans_select is already qual=true (a no-op

-- OR), and firm_onboarding's ALL policy already covers SELECT regardless of

-- what firm_onboarding_select says.

ALTER POLICY activity_log_select ON public.activity_log
  USING ((is_workspace_member(workspace_id)) OR (is_portal_user_for_entity(entity_type, entity_id)));

DROP POLICY activity_log_portal_select ON public.activity_log;

ALTER POLICY appointments_select ON public.appointments
  USING ((has_permission(workspace_id, 'appointments.view'::text)) OR ((portal_visible AND (client_id IS NOT NULL) AND is_portal_user(client_id))));

DROP POLICY appointments_portal_select ON public.appointments;

ALTER POLICY client_documents_select ON public.attachments
  USING ((has_permission(workspace_id, 'documents.view'::text)) OR (((visibility = 'client_visible'::text) AND (is_archived = false) AND is_portal_user_for_entity(entity_type, entity_id))));

DROP POLICY attachments_portal_select ON public.attachments;

ALTER POLICY client_documents_insert ON public.attachments
  WITH CHECK (((has_permission(workspace_id, 'documents.upload'::text) AND (uploaded_by = ( SELECT auth.uid() AS uid)))) OR (((visibility = 'client_visible'::text) AND (uploaded_by = (select auth.uid())) AND is_portal_user_for_entity(entity_type, entity_id))));

DROP POLICY attachments_portal_insert ON public.attachments;

ALTER POLICY client_ledger_select ON public.client_ledger
  USING ((has_permission(workspace_id, 'billing.view'::text)) OR (is_portal_user(client_id)));

DROP POLICY client_ledger_portal_select ON public.client_ledger;

ALTER POLICY client_portal_users_select ON public.client_portal_users
  USING ((is_workspace_member(workspace_id)) OR ((user_id = (select auth.uid()))));

DROP POLICY client_portal_users_self_select ON public.client_portal_users;

ALTER POLICY document_request_item_statuses_select ON public.document_request_item_statuses
  USING (((EXISTS ( SELECT 1
   FROM document_requests r
  WHERE ((r.id = document_request_item_statuses.document_request_id) AND has_permission(r.workspace_id, 'documents.view'::text))))) OR ((EXISTS ( SELECT 1
   FROM document_requests r
  WHERE ((r.id = document_request_item_statuses.document_request_id) AND is_portal_user_for_entity(r.entity_type, r.entity_id))))));

DROP POLICY document_request_item_statuses_portal_select ON public.document_request_item_statuses;

ALTER POLICY document_requests_select ON public.document_requests
  USING ((has_permission(workspace_id, 'documents.view'::text)) OR (is_portal_user_for_entity(entity_type, entity_id)));

DROP POLICY document_requests_portal_select ON public.document_requests;

ALTER POLICY invoices_select ON public.invoices
  USING ((has_permission(workspace_id, 'billing.view'::text)) OR (is_portal_user(client_id)));

DROP POLICY invoices_portal_select ON public.invoices;

ALTER POLICY irs_notices_select ON public.irs_notices
  USING ((has_permission(workspace_id, 'engagements.view'::text)) OR (is_portal_user_for_entity(entity_type, entity_id)));

DROP POLICY irs_notices_portal_select ON public.irs_notices;

ALTER POLICY message_threads_write ON public.message_threads
  WITH CHECK ((has_permission(workspace_id, 'messages.view'::text)) OR (((entity_type = 'client'::text) AND is_portal_user(entity_id) AND (created_by = (select auth.uid())))));

DROP POLICY message_threads_portal_insert ON public.message_threads;

ALTER POLICY message_threads_select ON public.message_threads
  USING ((has_permission(workspace_id, 'messages.view'::text)) OR (is_portal_user_for_entity(entity_type, entity_id)));

DROP POLICY message_threads_portal_select ON public.message_threads;

ALTER POLICY messages_write ON public.messages
  WITH CHECK (((has_permission(workspace_id, 'messages.send'::text) OR (is_internal AND has_permission(workspace_id, 'messages.internal_note'::text)))) OR (((sender_type = 'client'::text) AND (is_internal = false) AND (sender_id = (select auth.uid())) AND (EXISTS ( SELECT 1
   FROM message_threads t
  WHERE ((t.id = messages.thread_id) AND is_portal_user_for_entity(t.entity_type, t.entity_id)))))));

DROP POLICY messages_portal_insert ON public.messages;

ALTER POLICY messages_select ON public.messages
  USING ((has_permission(workspace_id, 'messages.view'::text)) OR (((is_internal = false) AND (EXISTS ( SELECT 1
   FROM message_threads t
  WHERE ((t.id = messages.thread_id) AND is_portal_user_for_entity(t.entity_type, t.entity_id)))))));

DROP POLICY messages_portal_select ON public.messages;

ALTER POLICY messages_update ON public.messages
  USING ((has_permission(workspace_id, 'messages.view'::text)) OR ((EXISTS ( SELECT 1
   FROM message_threads t
  WHERE ((t.id = messages.thread_id) AND is_portal_user_for_entity(t.entity_type, t.entity_id))))))
  WITH CHECK ((has_permission(workspace_id, 'messages.view'::text)) OR ((EXISTS ( SELECT 1
   FROM message_threads t
  WHERE ((t.id = messages.thread_id) AND is_portal_user_for_entity(t.entity_type, t.entity_id))))));

DROP POLICY messages_portal_update ON public.messages;

ALTER POLICY organizer_response_answers_insert ON public.organizer_response_answers
  WITH CHECK (((EXISTS ( SELECT 1
   FROM organizer_responses r
  WHERE ((r.id = organizer_response_answers.organizer_response_id) AND has_permission(r.workspace_id, 'engagements.manage'::text))))) OR ((EXISTS ( SELECT 1
   FROM organizer_responses r
  WHERE ((r.id = organizer_response_answers.organizer_response_id) AND is_portal_user(r.client_id) AND (r.status = ANY (ARRAY['not_started'::text, 'in_progress'::text])))))));

DROP POLICY organizer_response_answers_portal_insert ON public.organizer_response_answers;

ALTER POLICY organizer_response_answers_select ON public.organizer_response_answers
  USING (((EXISTS ( SELECT 1
   FROM organizer_responses r
  WHERE ((r.id = organizer_response_answers.organizer_response_id) AND has_permission(r.workspace_id, 'engagements.view'::text))))) OR ((EXISTS ( SELECT 1
   FROM organizer_responses r
  WHERE ((r.id = organizer_response_answers.organizer_response_id) AND is_portal_user(r.client_id))))));

DROP POLICY organizer_response_answers_portal_select ON public.organizer_response_answers;

ALTER POLICY organizer_response_answers_update ON public.organizer_response_answers
  USING (((EXISTS ( SELECT 1
   FROM organizer_responses r
  WHERE ((r.id = organizer_response_answers.organizer_response_id) AND has_permission(r.workspace_id, 'engagements.manage'::text))))) OR ((EXISTS ( SELECT 1
   FROM organizer_responses r
  WHERE ((r.id = organizer_response_answers.organizer_response_id) AND is_portal_user(r.client_id) AND (r.status = ANY (ARRAY['not_started'::text, 'in_progress'::text])))))));

DROP POLICY organizer_response_answers_portal_update ON public.organizer_response_answers;

ALTER POLICY organizer_responses_insert ON public.organizer_responses
  WITH CHECK ((has_permission(workspace_id, 'engagements.manage'::text)) OR ((is_portal_user(client_id) AND (status = ANY (ARRAY['not_started'::text, 'in_progress'::text])))));

DROP POLICY organizer_responses_portal_insert ON public.organizer_responses;

ALTER POLICY organizer_responses_select ON public.organizer_responses
  USING ((has_permission(workspace_id, 'engagements.view'::text)) OR (is_portal_user(client_id)));

DROP POLICY organizer_responses_portal_select ON public.organizer_responses;

ALTER POLICY organizer_responses_update ON public.organizer_responses
  USING ((has_permission(workspace_id, 'engagements.manage'::text)) OR ((is_portal_user(client_id) AND (status = ANY (ARRAY['not_started'::text, 'in_progress'::text])))));

DROP POLICY organizer_responses_portal_update ON public.organizer_responses;

ALTER POLICY payment_plans_select ON public.payment_plans
  USING ((has_permission(workspace_id, 'billing.view'::text)) OR ((EXISTS ( SELECT 1
   FROM invoices i
  WHERE ((i.id = payment_plans.invoice_id) AND is_portal_user(i.client_id))))));

DROP POLICY payment_plans_portal_select ON public.payment_plans;

ALTER POLICY payments_select ON public.payments
  USING ((has_permission(workspace_id, 'billing.view'::text)) OR (is_portal_user(client_id)));

DROP POLICY payments_portal_select ON public.payments;

ALTER POLICY quotes_select ON public.quotes
  USING ((has_permission(workspace_id, 'billing.view'::text)) OR (is_portal_user(client_id)));

DROP POLICY quotes_portal_select ON public.quotes;

ALTER POLICY signature_request_signers_select ON public.signature_request_signers
  USING (((EXISTS ( SELECT 1
   FROM signature_requests r
  WHERE ((r.id = signature_request_signers.signature_request_id) AND has_permission(r.workspace_id, 'signatures.view'::text))))) OR ((EXISTS ( SELECT 1
   FROM (signature_requests r
     JOIN attachments a ON ((a.id = r.attachment_id)))
  WHERE ((r.id = signature_request_signers.signature_request_id) AND is_portal_user_for_entity(a.entity_type, a.entity_id))))));

DROP POLICY signature_request_signers_portal_select ON public.signature_request_signers;

ALTER POLICY signature_requests_select ON public.signature_requests
  USING ((has_permission(workspace_id, 'signatures.view'::text)) OR ((EXISTS ( SELECT 1
   FROM attachments a
  WHERE ((a.id = signature_requests.attachment_id) AND is_portal_user_for_entity(a.entity_type, a.entity_id))))));

DROP POLICY signature_requests_portal_select ON public.signature_requests;