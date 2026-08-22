-- Three portal-facing tables had SELECT policies covering staff access
-- (is_workspace_member / has_permission) plus an unrelated cross-workspace
-- engagement-sharing branch, but no is_portal_user() branch at all -- so a
-- real client-portal session got zero rows from clients, document_folders,
-- and engagements, even for their own data. Confirmed live via a simulated
-- portal session before this migration: attachments (which already has a
-- portal branch) correctly returned the row, while these three returned 0.
--
-- This only widens what a portal user can read of their own linked client
-- record and its own engagements/folders -- it doesn't touch INSERT/UPDATE/
-- DELETE, and doesn't change staff-side access at all.

alter policy clients_select on public.clients
  using (
    is_workspace_member(workspace_id)
    or (exists (select 1 from public.engagements e where e.client_id = clients.id and has_pending_engagement_share_access(e.id)))
    or is_portal_user(id)
  );

alter policy document_folders_select on public.document_folders
  using (
    has_permission(workspace_id, 'documents.view')
    or is_portal_user_for_entity(entity_type, entity_id)
  );

alter policy engagements_select on public.engagements
  using (
    has_permission(workspace_id, 'engagements.view')
    or has_pending_engagement_share_access(id)
    or is_portal_user_for_entity('engagement', id)
  );
