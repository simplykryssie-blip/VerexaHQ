-- Suspension/Archive lifecycle hardening, item 2 (RLS closure pass).
--
-- Follow-up to 20261016000000/20261017000000, which added
-- is_workspace_operational(workspace_id) to a deliberately narrow,
-- named list of "highest-value operational tables" and never circled
-- back to the rest. This migration closes the remaining staff-mutation
-- RLS gaps identified by the suspension/archive audit: invoices,
-- attachments (client_documents), document_folders, document_requests,
-- email_templates, sms_templates, organizer_templates,
-- document_request_templates, firm_connections, processes (pipelines),
-- pipeline_runs, pipeline_stages, library_folders, appointments.
--
-- Same technique as the precedent migrations: `alter policy` preserves
-- every other property of each existing policy (roles, permissive/
-- restrictive, command) and only resets the USING/WITH CHECK expression,
-- ANDing in the existing canonical is_workspace_operational() check
-- alongside the pre-existing authorization logic (never replacing it).
-- is_workspace_operational() itself is unchanged: still
-- `status = 'active' OR is_platform_admin()`, so this closure treats
-- suspended/archived/permanently_archived identically, and platform
-- admins keep their existing bypass everywhere it already applied.
--
-- Read-only/select policies and client-portal branches are untouched --
-- this migration is scoped to staff-side write policies only, matching
-- the audit's explicit findings.

-- invoices
alter policy invoices_delete on public.invoices
  using (is_workspace_admin(workspace_id) and is_workspace_operational(workspace_id));

alter policy invoices_update on public.invoices
  using (has_permission(workspace_id, 'billing.manage'::text) and is_workspace_operational(workspace_id))
  with check (has_permission(workspace_id, 'billing.manage'::text) and is_workspace_operational(workspace_id));

alter policy invoices_write on public.invoices
  with check (has_permission(workspace_id, 'billing.manage'::text) and is_workspace_operational(workspace_id));

-- attachments (client_documents_*) -- staff branches only. The
-- client-portal branch keeps is_client_portal_window_active (added by
-- 20261029000000) and the partner-firm-connection branch is untouched
-- (separate concern, not in scope here).
alter policy client_documents_delete on public.attachments
  using (has_permission(workspace_id, 'documents.delete'::text) and is_workspace_operational(workspace_id));

alter policy client_documents_update on public.attachments
  using ((has_permission(workspace_id, 'documents.upload'::text) or has_permission(workspace_id, 'documents.delete'::text)) and is_workspace_operational(workspace_id))
  with check ((has_permission(workspace_id, 'documents.upload'::text) or has_permission(workspace_id, 'documents.delete'::text)) and is_workspace_operational(workspace_id));

alter policy client_documents_insert on public.attachments
  with check (
    (has_permission(workspace_id, 'documents.upload'::text) and (uploaded_by = ( select auth.uid() )) and is_workspace_operational(workspace_id))
    or ((visibility = 'client_visible'::text) and (uploaded_by = ( select auth.uid() )) and is_portal_user_for_entity(entity_type, entity_id) and is_client_portal_window_active(workspace_id))
    or ((uploaded_by = ( select auth.uid() )) and is_partner_workspace_for_firm_connection(workspace_id, entity_type, entity_id))
  );

-- document_folders
alter policy document_folders_delete on public.document_folders
  using (has_permission(workspace_id, 'documents.delete'::text) and is_workspace_operational(workspace_id));

alter policy document_folders_insert on public.document_folders
  with check (has_permission(workspace_id, 'documents.upload'::text) and is_workspace_operational(workspace_id));

alter policy document_folders_update on public.document_folders
  using (has_permission(workspace_id, 'documents.upload'::text) and is_workspace_operational(workspace_id));

-- document_requests
alter policy document_requests_delete on public.document_requests
  using (has_permission(workspace_id, 'documents.request'::text) and is_workspace_operational(workspace_id));

alter policy document_requests_insert on public.document_requests
  with check (has_permission(workspace_id, 'documents.request'::text) and is_workspace_operational(workspace_id));

alter policy document_requests_update on public.document_requests
  using (has_permission(workspace_id, 'documents.request'::text) and is_workspace_operational(workspace_id));

-- email_templates
alter policy email_templates_delete on public.email_templates
  using (workspace_id is not null and is_workspace_admin(workspace_id) and is_workspace_operational(workspace_id));

alter policy email_templates_insert on public.email_templates
  with check (workspace_id is not null and is_workspace_admin(workspace_id) and is_workspace_operational(workspace_id));

alter policy email_templates_update on public.email_templates
  using (workspace_id is not null and is_workspace_admin(workspace_id) and is_workspace_operational(workspace_id));

-- sms_templates
alter policy sms_templates_delete on public.sms_templates
  using (workspace_id is not null and is_workspace_admin(workspace_id) and is_workspace_operational(workspace_id));

alter policy sms_templates_insert on public.sms_templates
  with check (workspace_id is not null and is_workspace_admin(workspace_id) and is_workspace_operational(workspace_id));

alter policy sms_templates_update on public.sms_templates
  using (workspace_id is not null and is_workspace_admin(workspace_id) and is_workspace_operational(workspace_id));

-- document_request_templates
alter policy document_request_templates_delete on public.document_request_templates
  using (workspace_id is not null and is_workspace_admin(workspace_id) and is_workspace_operational(workspace_id));

alter policy document_request_templates_insert on public.document_request_templates
  with check (workspace_id is not null and is_workspace_admin(workspace_id) and is_workspace_operational(workspace_id));

alter policy document_request_templates_update on public.document_request_templates
  using (workspace_id is not null and is_workspace_admin(workspace_id) and is_workspace_operational(workspace_id));

-- organizer_templates
alter policy organizer_templates_delete on public.organizer_templates
  using (workspace_id is not null and is_workspace_admin(workspace_id) and is_workspace_operational(workspace_id));

alter policy organizer_templates_insert on public.organizer_templates
  with check (workspace_id is not null and is_workspace_admin(workspace_id) and is_workspace_operational(workspace_id));

alter policy organizer_templates_update on public.organizer_templates
  using (workspace_id is not null and is_workspace_admin(workspace_id) and is_workspace_operational(workspace_id));

-- firm_connections (keyed by parent_workspace_id, not workspace_id)
alter policy firm_connections_delete on public.firm_connections
  using (is_workspace_admin(parent_workspace_id) and is_workspace_operational(parent_workspace_id));

alter policy firm_connections_insert on public.firm_connections
  with check (is_workspace_admin(parent_workspace_id) and is_workspace_operational(parent_workspace_id));

alter policy firm_connections_update on public.firm_connections
  using (is_workspace_admin(parent_workspace_id) and is_workspace_operational(parent_workspace_id));

-- processes (pipelines)
alter policy processes_delete on public.processes
  using (workspace_id is not null and has_permission(workspace_id, 'pipelines.manage'::text) and is_workspace_operational(workspace_id));

alter policy processes_insert on public.processes
  with check (workspace_id is not null and has_permission(workspace_id, 'pipelines.manage'::text) and is_workspace_operational(workspace_id));

alter policy processes_update on public.processes
  using (workspace_id is not null and has_permission(workspace_id, 'pipelines.manage'::text) and is_workspace_operational(workspace_id));

-- pipeline_runs / pipeline_stages (entity_type-driven CASE expressions)
alter policy pipeline_runs_update on public.pipeline_runs
  using (
    (case entity_type
      when 'client'::text then has_permission(workspace_id, 'clients.edit'::text)
      when 'engagement'::text then has_permission(workspace_id, 'engagements.manage'::text)
      else false
    end)
    and is_workspace_operational(workspace_id)
  );

alter policy pipeline_stages_update on public.pipeline_stages
  using (
    (case entity_type
      when 'client'::text then has_permission(workspace_id, 'clients.edit'::text)
      when 'engagement'::text then (has_permission(workspace_id, 'engagements.manage'::text) or (( select auth.uid() ) = assigned_staff_id))
      else false
    end)
    and is_workspace_operational(workspace_id)
  )
  with check (
    (case entity_type
      when 'client'::text then has_permission(workspace_id, 'clients.edit'::text)
      when 'engagement'::text then (has_permission(workspace_id, 'engagements.manage'::text) or (( select auth.uid() ) = assigned_staff_id))
      else false
    end)
    and is_workspace_operational(workspace_id)
  );

-- library_folders (item_type-driven OR chain)
alter policy library_folders_delete on public.library_folders
  using (
    is_workspace_member(workspace_id)
    and is_workspace_operational(workspace_id)
    and (
      ((item_type = 'pipeline'::text) and has_permission(workspace_id, 'pipelines.manage'::text))
      or ((item_type = 'workflow'::text) and has_permission(workspace_id, 'automations.manage'::text))
      or ((item_type = 'website'::text) and has_permission(workspace_id, 'site_pages.manage'::text))
      or ((item_type = any (array['email_sms_template'::text, 'form_template'::text])) and is_workspace_admin(workspace_id))
    )
  );

alter policy library_folders_insert on public.library_folders
  with check (
    is_workspace_member(workspace_id)
    and is_workspace_operational(workspace_id)
    and (
      ((item_type = 'pipeline'::text) and has_permission(workspace_id, 'pipelines.manage'::text))
      or ((item_type = 'workflow'::text) and has_permission(workspace_id, 'automations.manage'::text))
      or ((item_type = 'website'::text) and has_permission(workspace_id, 'site_pages.manage'::text))
      or ((item_type = any (array['email_sms_template'::text, 'form_template'::text])) and is_workspace_admin(workspace_id))
    )
  );

alter policy library_folders_update on public.library_folders
  using (
    is_workspace_member(workspace_id)
    and is_workspace_operational(workspace_id)
    and (
      ((item_type = 'pipeline'::text) and has_permission(workspace_id, 'pipelines.manage'::text))
      or ((item_type = 'workflow'::text) and has_permission(workspace_id, 'automations.manage'::text))
      or ((item_type = 'website'::text) and has_permission(workspace_id, 'site_pages.manage'::text))
      or ((item_type = any (array['email_sms_template'::text, 'form_template'::text])) and is_workspace_admin(workspace_id))
    )
  );

-- appointments
alter policy appointments_delete on public.appointments
  using (has_permission(workspace_id, 'appointments.manage'::text) and is_workspace_operational(workspace_id));

alter policy appointments_insert on public.appointments
  with check (has_permission(workspace_id, 'appointments.manage'::text) and is_workspace_operational(workspace_id));

alter policy appointments_update on public.appointments
  using (has_permission(workspace_id, 'appointments.manage'::text) and is_workspace_operational(workspace_id));
