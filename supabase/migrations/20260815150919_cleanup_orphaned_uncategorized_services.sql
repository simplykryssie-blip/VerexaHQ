-- The 6 system service_categories these services used to belong to
-- (Individual Tax, Business Tax, Amendments & Corrections, Extensions,
-- IRS Resolution, Tax Planning) were deleted and replaced with the new
-- Tax Preparation/Bookkeeping/Payroll/Business Services taxonomy earlier
-- this session. service_categories's FK from services is ON DELETE SET
-- NULL, not CASCADE, so these 6 category-level services survived with
-- service_category_id nulled out instead of being cleaned up -- leaving
-- bare, uncategorized duplicates sitting next to the new fine-grained
-- catalog (e.g. both "Individual Tax" and "Individual tax return
-- (current year)" now show up in the same engagement-creation picker).
--
-- Verified live before deleting: all workspace_id is null, status
-- 'published', zero organizer_template_id/document_request_template_id
-- (bare stubs, never fully built out), and zero references from
-- engagements.service_id, client_service_interests.service_id,
-- organizer_service_routes.service_id, or organizer_responses.
-- resolved_service_id. One workspace-owned draft clone
-- (services.cloned_from_service_id) points at "Individual Tax" for
-- lineage only -- that FK is ON DELETE SET NULL, so the draft itself is
-- unaffected, it just loses that historical pointer.
delete from public.services
where name in ('Extensions', 'IRS Resolution', 'Tax Planning', 'Business Tax', 'Individual Tax', 'Amendments & Corrections')
  and workspace_id is null;
