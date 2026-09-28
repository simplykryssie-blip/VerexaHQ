-- Recover the MKB QuickBooks & Bookkeeping service/pipeline configuration
-- that already exists in production but was never captured in git. Confirmed
-- created through an untracked/manual path: production's own
-- supabase_migrations.schema_migrations records two earlier migrations
-- (20260920215527 "quickbooks_bookkeeping_consultation_intake" and
-- 20260920235248 "quickbooks_intake_split_cleanup_section") whose recorded
-- statements describe a materially different, since-abandoned build -- a
-- third "QuickBooks Cleanup / Catch-Up" service, priced/bookable consultation
-- fields, a qualification trigger function, workspace tags, and two
-- automations -- none of which are present in the live data today, and none
-- of which have a corresponding file anywhere in git history. Per migration
-- discipline for an untracked/manual path, this migration captures the
-- current, verified-live canonical state only; it does not attempt to
-- replay that abandoned history.
--
-- Also restores processes.status to 'published' on the QuickBooks &
-- Bookkeeping pipeline: it was found 'archived' at reconciliation time
-- (updated_at 2026-09-21 14:08:25 UTC), evidently a side effect of a real
-- staff member's QuickBooks organizer test submission and its cleanup a
-- short time earlier (see activity_log for workspace
-- 2896bf43-95db-420f-9bb5-8854f537bbd1); the test client and organizer
-- response were already fully deleted by the time of this migration.
-- 'published' is required for the pipeline to be usable at all, and is the
-- state the confirmed service linkage (next migration) assumes.

insert into public.service_categories (id, workspace_id, name, slug, display_order)
values ('a1000000-0000-0000-0000-000000000001', '2896bf43-95db-420f-9bb5-8854f537bbd1', 'QuickBooks & Bookkeeping', 'quickbooks-bookkeeping', 900)
on conflict (id) do nothing;

insert into public.processes (id, workspace_id, name, slug, status, is_lead_funnel)
values ('a3000000-0000-0000-0000-000000000001', '2896bf43-95db-420f-9bb5-8854f537bbd1', 'QuickBooks & Bookkeeping', 'quickbooks-bookkeeping', 'published', false)
on conflict (id) do update set status = 'published';

insert into public.process_stages (id, process_id, name, display_order) values
('a4000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001', 'Consultation Requested', 0),
('a4000000-0000-0000-0000-000000000002', 'a3000000-0000-0000-0000-000000000001', 'Consultation Scheduled', 1),
('a4000000-0000-0000-0000-000000000003', 'a3000000-0000-0000-0000-000000000001', 'Consultation Completed', 2),
('a4000000-0000-0000-0000-000000000004', 'a3000000-0000-0000-0000-000000000001', 'Bookkeeping Opportunity', 3),
('a4000000-0000-0000-0000-000000000005', 'a3000000-0000-0000-0000-000000000001', 'Proposal Sent', 4),
('a4000000-0000-0000-0000-000000000006', 'a3000000-0000-0000-0000-000000000001', 'Bookkeeping Onboarding', 5),
('a4000000-0000-0000-0000-000000000007', 'a3000000-0000-0000-0000-000000000001', 'Active Bookkeeping', 6),
('a4000000-0000-0000-0000-000000000008', 'a3000000-0000-0000-0000-000000000001', 'Not Pursuing', 7)
on conflict (id) do nothing;

insert into public.services (
  id, workspace_id, service_category_id, name, slug, description, process_id,
  is_bookable, is_portal_visible, display_order, status,
  allowed_weekdays, booking_location_type, booking_min_notice_hours_override, booking_buffer_minutes_override
) values (
  'a2000000-0000-0000-0000-000000000001', '2896bf43-95db-420f-9bb5-8854f537bbd1', 'a1000000-0000-0000-0000-000000000001',
  'QuickBooks Setup Consultation', 'quickbooks-setup-consultation',
  '90-minute consultation to qualify QuickBooks setup needs and identify bookkeeping opportunities.',
  null, false, true, 0, 'published',
  array[1,2,3,4,5], 'call', 24, 15
)
on conflict (id) do nothing;

insert into public.services (
  id, workspace_id, service_category_id, name, slug, description, process_id,
  is_bookable, is_portal_visible, display_order, status, booking_location_type
) values (
  'a2000000-0000-0000-0000-000000000002', '2896bf43-95db-420f-9bb5-8854f537bbd1', 'a1000000-0000-0000-0000-000000000001',
  'Monthly Bookkeeping', 'monthly-bookkeeping',
  'Ongoing monthly bookkeeping -- custom quote, sold after the consultation identifies the need.',
  'a3000000-0000-0000-0000-000000000001', false, false, 1, 'published', 'call'
)
on conflict (id) do nothing;
