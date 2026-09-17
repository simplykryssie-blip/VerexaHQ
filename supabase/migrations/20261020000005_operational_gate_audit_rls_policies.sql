-- P1: workspace-operational-gate audit -- RLS policy gaps.
--
-- These tables' own INSERT/UPDATE/DELETE RLS policies never included
-- is_workspace_operational(workspace_id) at all -- independent of any
-- SECURITY DEFINER RPC bypass, a raw PostgREST call against these tables
-- (by any authenticated user holding the base permission) could mutate
-- them in a suspended/archived/permanently_archived workspace. Smallest
-- possible fix per table: AND the existing check with the operational gate.
--
-- internal_messages and network_message_threads/network_messages were
-- also found without the check, but are deliberately NOT touched here --
-- staff-to-staff and cross-workspace communication about resolving a
-- suspension is a legitimate thing to keep working, and network messaging
-- already has its own (non-identical but not-a-bypass) status check via
-- workspace_is_active(). See the audit report for detail.

alter policy client_addresses_insert on public.client_addresses
  with check (has_permission(workspace_id, 'clients.edit') and is_workspace_operational(workspace_id));
alter policy client_addresses_update on public.client_addresses
  using (has_permission(workspace_id, 'clients.edit') and is_workspace_operational(workspace_id))
  with check (has_permission(workspace_id, 'clients.edit') and is_workspace_operational(workspace_id));
alter policy client_addresses_delete on public.client_addresses
  using (has_permission(workspace_id, 'clients.edit') and is_workspace_operational(workspace_id));

alter policy client_emails_insert on public.client_emails
  with check (has_permission(workspace_id, 'clients.edit') and is_workspace_operational(workspace_id));
alter policy client_emails_update on public.client_emails
  using (has_permission(workspace_id, 'clients.edit') and is_workspace_operational(workspace_id))
  with check (has_permission(workspace_id, 'clients.edit') and is_workspace_operational(workspace_id));
alter policy client_emails_delete on public.client_emails
  using (has_permission(workspace_id, 'clients.edit') and is_workspace_operational(workspace_id));

alter policy client_phones_insert on public.client_phones
  with check (has_permission(workspace_id, 'clients.edit') and is_workspace_operational(workspace_id));
alter policy client_phones_update on public.client_phones
  using (has_permission(workspace_id, 'clients.edit') and is_workspace_operational(workspace_id))
  with check (has_permission(workspace_id, 'clients.edit') and is_workspace_operational(workspace_id));
alter policy client_phones_delete on public.client_phones
  using (has_permission(workspace_id, 'clients.edit') and is_workspace_operational(workspace_id));

alter policy client_relationships_insert on public.client_relationships
  with check (has_permission(workspace_id, 'clients.edit') and is_workspace_operational(workspace_id));
alter policy client_relationships_update on public.client_relationships
  using (has_permission(workspace_id, 'clients.edit') and is_workspace_operational(workspace_id))
  with check (has_permission(workspace_id, 'clients.edit') and is_workspace_operational(workspace_id));
alter policy client_relationships_delete on public.client_relationships
  using (has_permission(workspace_id, 'clients.edit') and is_workspace_operational(workspace_id));

alter policy document_requests_insert on public.document_requests
  with check (has_permission(workspace_id, 'documents.request') and is_workspace_operational(workspace_id));
alter policy document_requests_update on public.document_requests
  using (has_permission(workspace_id, 'documents.request') and is_workspace_operational(workspace_id));
alter policy document_requests_delete on public.document_requests
  using (has_permission(workspace_id, 'documents.request') and is_workspace_operational(workspace_id));

alter policy document_request_items_insert on public.document_request_items
  with check (exists (
    select 1 from document_request_templates t
    where t.id = document_request_items.document_request_template_id
      and t.workspace_id is not null
      and is_workspace_admin(t.workspace_id)
      and is_workspace_operational(t.workspace_id)
  ));
alter policy document_request_items_update on public.document_request_items
  using (exists (
    select 1 from document_request_templates t
    where t.id = document_request_items.document_request_template_id
      and t.workspace_id is not null
      and is_workspace_admin(t.workspace_id)
      and is_workspace_operational(t.workspace_id)
  ));
alter policy document_request_items_delete on public.document_request_items
  using (exists (
    select 1 from document_request_templates t
    where t.id = document_request_items.document_request_template_id
      and t.workspace_id is not null
      and is_workspace_admin(t.workspace_id)
      and is_workspace_operational(t.workspace_id)
  ));

alter policy engagement_letter_templates_insert on public.engagement_letter_templates
  with check (workspace_id is not null and is_workspace_admin(workspace_id) and is_workspace_operational(workspace_id));
alter policy engagement_letter_templates_update on public.engagement_letter_templates
  using (workspace_id is not null and is_workspace_admin(workspace_id) and is_workspace_operational(workspace_id));
alter policy engagement_letter_templates_delete on public.engagement_letter_templates
  using (workspace_id is not null and is_workspace_admin(workspace_id) and is_workspace_operational(workspace_id));

alter policy firm_connection_contacts_insert on public.firm_connection_contacts
  with check (exists (
    select 1 from firm_connections fc
    where fc.id = firm_connection_contacts.connection_id
      and has_permission(fc.parent_workspace_id, 'firm_connections.manage')
      and is_workspace_operational(fc.parent_workspace_id)
  ));
alter policy firm_connection_contacts_update on public.firm_connection_contacts
  using (exists (
    select 1 from firm_connections fc
    where fc.id = firm_connection_contacts.connection_id
      and has_permission(fc.parent_workspace_id, 'firm_connections.manage')
      and is_workspace_operational(fc.parent_workspace_id)
  ));
alter policy firm_connection_contacts_delete on public.firm_connection_contacts
  using (exists (
    select 1 from firm_connections fc
    where fc.id = firm_connection_contacts.connection_id
      and has_permission(fc.parent_workspace_id, 'firm_connections.manage')
      and is_workspace_operational(fc.parent_workspace_id)
  ));

alter policy irs_authorizations_insert on public.irs_authorizations
  with check (has_permission(workspace_id, 'irs_authorizations.manage') and is_workspace_operational(workspace_id));
alter policy irs_authorizations_update on public.irs_authorizations
  using (has_permission(workspace_id, 'irs_authorizations.manage') and is_workspace_operational(workspace_id));

alter policy quotes_write on public.quotes
  with check (has_permission(workspace_id, 'billing.manage') and is_workspace_operational(workspace_id));
alter policy quotes_update on public.quotes
  using (has_permission(workspace_id, 'billing.manage') and is_workspace_operational(workspace_id))
  with check (has_permission(workspace_id, 'billing.manage') and is_workspace_operational(workspace_id));
alter policy quotes_delete on public.quotes
  using (is_workspace_admin(workspace_id) and is_workspace_operational(workspace_id));

alter policy signature_requests_insert on public.signature_requests
  with check (has_permission(workspace_id, 'signatures.request') and is_workspace_operational(workspace_id));
alter policy signature_requests_update on public.signature_requests
  using (has_permission(workspace_id, 'signatures.request') and is_workspace_operational(workspace_id));
alter policy signature_requests_delete on public.signature_requests
  using (has_permission(workspace_id, 'signatures.request') and is_workspace_operational(workspace_id));

alter policy workspace_invitations_insert on public.workspace_invitations
  with check (has_permission(workspace_id, 'users.invite') and is_workspace_operational(workspace_id));
