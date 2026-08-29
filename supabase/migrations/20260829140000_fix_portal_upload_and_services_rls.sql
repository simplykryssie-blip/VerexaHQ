-- Two bugs found during a Client Portal end-to-end QA pass:
--
-- 1. attachments had two separate AFTER INSERT triggers logging the same
--    "document uploaded" activity: record_attachment_uploaded() (legacy,
--    NOT security definer) and record_attachment_activity() (its
--    security-definer replacement, which also handles delete/archive/
--    restore/rename). The legacy one runs as the calling role, so its
--    insert into activity_log hits activity_log_insert's RLS
--    (is_workspace_member(workspace_id)) -- which a portal client never
--    satisfies. Every direct portal-side attachments insert (organizer
--    file uploads, document-request fulfillment) failed outright with a
--    permission error and rolled back. Staff uploads "worked" but were
--    silently double-logging the same event. Dropping the legacy
--    trigger/function fixes both: portal uploads succeed, and staff
--    uploads log once instead of twice.
--
-- 2. services_select had no portal-user branch, unlike its sibling
--    organizer_templates_select. Any workspace-specific (non-global)
--    service is invisible to a portal client, so services(name) embeds on
--    engagements/quotes silently return null and the UI falls back to a
--    generic label instead of the real service name.

drop trigger if exists record_attachment_uploaded on public.attachments;
drop function if exists public.record_attachment_uploaded();

drop policy if exists services_select on public.services;
create policy services_select on public.services
  for select
  using (
    workspace_id is null
    or public.is_workspace_member(workspace_id)
    or public.has_config_object_share_access('services', id)
    or public.is_portal_member(workspace_id)
  );
