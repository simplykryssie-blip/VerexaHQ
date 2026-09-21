-- Apply the confirmed QuickBooks Setup Consultation -> organizer/pipeline
-- linkage per the MKB QuickBooks intake reconciliation.
--
-- Monthly Bookkeeping is intentionally left unlinked to the organizer, and no
-- organizer_service_routes row is created: resolve_organizer_response_service()
-- falls back to counting services.organizer_template_id + workspace_id
-- matches when no route row exists for the organizer template, and
-- QuickBooks Setup Consultation is the only service in this workspace that
-- will carry this organizer_template_id, so that fallback resolves to
-- exactly one candidate.

update public.services
set organizer_template_id = 'a5000000-0000-0000-0000-000000000001',
    process_id = 'a3000000-0000-0000-0000-000000000001'
where id = 'a2000000-0000-0000-0000-000000000001';
