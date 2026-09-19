-- Correction pass, blocker 2: 20261030030000_client_portal_read_window_enforcement.sql
-- reconstructed document_folders_select, document_requests_select, and
-- client_documents_select from a version of these policies that predated
-- 20261010000000_partner_onboarding_backend_access.sql's
-- is_partner_workspace_for_firm_connection(...) branch -- silently
-- dropping legitimate partner-firm read access to shared documents/
-- folders/requests, a real feature regression (not a security weakening;
-- the resulting policy was strictly more restrictive, just wrong).
--
-- Fix: restore all three policies to their exact current-main shape
-- (has_permission branch, portal branch, cross-firm-share branch where
-- present, and the partner-firm-connection branch), adding
-- is_client_portal_window_active(workspace_id) ONLY to the portal
-- (is_portal_user_for_entity) branch -- exactly as the rest of
-- 20261030030000 already does correctly for every other policy it
-- touches. The partner-firm branch is untouched, matching the product
-- architecture: firm-connection access isn't part of the client-portal
-- suspension-continuity window, so it isn't subject to that window's gate.

alter policy document_requests_select on public.document_requests
  using (
    has_permission(workspace_id, 'documents.view'::text)
    or (is_portal_user_for_entity(entity_type, entity_id) and is_client_portal_window_active(workspace_id))
    or is_partner_workspace_for_firm_connection(workspace_id, entity_type, entity_id)
  );

alter policy document_folders_select on public.document_folders
  using (
    has_permission(workspace_id, 'documents.view'::text)
    or (is_portal_user_for_entity(entity_type, entity_id) and is_client_portal_window_active(workspace_id))
    or is_partner_workspace_for_firm_connection(workspace_id, entity_type, entity_id)
  );

alter policy client_documents_select on public.attachments
  using (
    has_permission(workspace_id, 'documents.view'::text)
    or ((visibility = 'client_visible'::text) and (is_archived = false) and is_portal_user_for_entity(entity_type, entity_id) and is_client_portal_window_active(workspace_id))
    or (
      (visibility = 'client_visible'::text) and (is_archived = false) and (
        ((entity_type = 'engagement'::text) and has_pending_engagement_share_access(entity_id))
        or ((entity_type = 'client'::text) and (exists (
          select 1 from engagements e where e.client_id = attachments.entity_id and has_pending_engagement_share_access(e.id)
        )))
      )
    )
    or is_partner_workspace_for_firm_connection(workspace_id, entity_type, entity_id)
  );
