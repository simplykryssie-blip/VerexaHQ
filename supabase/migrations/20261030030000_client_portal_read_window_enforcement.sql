-- Suspension/Archive lifecycle hardening, item 5 (client-portal read
-- enforcement). 20261029000000 closed the write-side gap (a client could
-- write through Archived/Permanently Archived, not just the Day 0-30
-- window) on 7 specific write policies, but left every SELECT policy on
-- the same portal-facing tables completely unguarded -- an archived or
-- permanently-archived workspace's client could still read everything
-- indefinitely. This migration adds is_client_portal_window_active()
-- (already defined by 20261029000000: active, or suspended within 30 days
-- of suspended_at) to the client-portal branch ONLY of each policy below.
-- Staff branches (has_permission) and the unrelated cross-firm
-- engagement-share-access branches (has_pending_engagement_share_access,
-- a completely different feature -- reviewing another firm's shared
-- engagement, not client-portal access) are left untouched.

alter policy activity_log_select on public.activity_log
  using (
    is_workspace_member(workspace_id)
    or (is_portal_user_for_entity(entity_type, entity_id) and is_client_portal_window_active(workspace_id))
  );

alter policy appointments_select on public.appointments
  using (
    has_permission(workspace_id, 'appointments.view'::text)
    or (portal_visible and (client_id is not null) and is_portal_user(client_id) and is_client_portal_window_active(workspace_id))
  );

alter policy client_documents_select on public.attachments
  using (
    has_permission(workspace_id, 'documents.view'::text)
    or ((visibility = 'client_visible'::text) and (is_archived = false) and is_portal_user_for_entity(entity_type, entity_id) and is_client_portal_window_active(workspace_id))
    or ((visibility = 'client_visible'::text) and (is_archived = false) and (
      ((entity_type = 'engagement'::text) and has_pending_engagement_share_access(entity_id))
      or ((entity_type = 'client'::text) and (exists (
        select 1 from engagements e where e.client_id = attachments.entity_id and has_pending_engagement_share_access(e.id)
      )))
    ))
  );

alter policy client_ledger_select on public.client_ledger
  using (
    has_permission(workspace_id, 'billing.view'::text)
    or (is_portal_user(client_id) and is_client_portal_window_active(workspace_id))
  );

alter policy document_folders_select on public.document_folders
  using (
    has_permission(workspace_id, 'documents.view'::text)
    or (is_portal_user_for_entity(entity_type, entity_id) and is_client_portal_window_active(workspace_id))
  );

alter policy document_requests_select on public.document_requests
  using (
    has_permission(workspace_id, 'documents.view'::text)
    or (is_portal_user_for_entity(entity_type, entity_id) and is_client_portal_window_active(workspace_id))
  );

alter policy engagements_select on public.engagements
  using (
    has_permission(workspace_id, 'engagements.view'::text)
    or has_pending_engagement_share_access(id)
    or (is_portal_user_for_entity('engagement'::text, id) and is_client_portal_window_active(workspace_id))
  );

alter policy invoices_select on public.invoices
  using (
    has_permission(workspace_id, 'billing.view'::text)
    or (is_portal_user(client_id) and is_client_portal_window_active(workspace_id))
  );

alter policy irs_notices_select on public.irs_notices
  using (
    has_permission(workspace_id, 'engagements.view'::text)
    or (is_portal_user_for_entity(entity_type, entity_id) and is_client_portal_window_active(workspace_id))
  );

alter policy message_threads_select on public.message_threads
  using (
    has_permission(workspace_id, 'messages.view'::text)
    or (is_portal_user_for_entity(entity_type, entity_id) and is_client_portal_window_active(workspace_id))
  );

alter policy messages_select on public.messages
  using (
    has_permission(workspace_id, 'messages.view'::text)
    or (
      (is_internal = false)
      and (exists (select 1 from message_threads t where (t.id = messages.thread_id) and is_portal_user_for_entity(t.entity_type, t.entity_id)))
      and is_client_portal_window_active(workspace_id)
    )
  );

alter policy organizer_responses_select on public.organizer_responses
  using (
    has_permission(workspace_id, 'engagements.view'::text)
    or (is_portal_user(client_id) and is_client_portal_window_active(workspace_id))
    or has_pending_engagement_share_access(engagement_id)
  );

alter policy payments_select on public.payments
  using (
    has_permission(workspace_id, 'billing.view'::text)
    or (is_portal_user(client_id) and is_client_portal_window_active(workspace_id))
  );

alter policy quotes_select on public.quotes
  using (
    has_permission(workspace_id, 'billing.view'::text)
    or (is_portal_user(client_id) and is_client_portal_window_active(workspace_id))
  );

alter policy tasks_select_portal on public.tasks
  using (
    (visibility = 'client'::text)
    and is_client_portal_window_active(workspace_id)
    and (
      ((client_id is not null) and is_portal_user(client_id))
      or ((engagement_id is not null) and is_portal_accessible_entity_id(engagement_id))
    )
  );
