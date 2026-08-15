-- Replace the 6 pre-existing system service categories (zero services
-- existed under any of them, and none is referenced anywhere else in the
-- live app -- verified via pg_constraint and a direct count before this
-- migration ran) with the 4 categories actually wanted for the public
-- lead-capture picker, each with real sub-services.
delete from public.service_categories where workspace_id is null;

with new_categories as (
  insert into public.service_categories (workspace_id, name, slug, display_order)
  values
    (null, 'Tax Preparation', 'tax-preparation', 0),
    (null, 'Bookkeeping', 'bookkeeping', 1),
    (null, 'Payroll', 'payroll', 2),
    (null, 'Business Services', 'business-services', 3)
  returning id, slug
)
insert into public.services (
  workspace_id, service_category_id, name, slug, status, display_order,
  is_bookable, is_portal_visible, requires_organizer, requires_engagement_letter,
  requires_documents, requires_signature, requires_review, requires_invoice,
  requires_payment_before_release, tags
)
select null, new_categories.id, v.name, v.slug, 'published', v.display_order,
  false, false, false, false, false, false, false, false, false, '{}'::text[]
from new_categories
join (
  values
    ('tax-preparation', 'Individual tax return (current year)', 'individual-return-current-year', 0),
    ('tax-preparation', 'Individual tax return (prior year)', 'individual-return-prior-year', 1),
    ('tax-preparation', 'Business tax return (current year)', 'business-return-current-year', 2),
    ('tax-preparation', 'Business tax return (prior year)', 'business-return-prior-year', 3),
    ('tax-preparation', 'Amended return', 'amended-return', 4),
    ('tax-preparation', 'Tax extension', 'tax-extension', 5),
    ('tax-preparation', 'IRS notice / resolution', 'irs-notice-resolution', 6),
    ('tax-preparation', 'Tax planning & consulting', 'tax-planning-consulting', 7),
    ('bookkeeping', 'Monthly bookkeeping', 'monthly-bookkeeping', 0),
    ('bookkeeping', 'Cleanup / catch-up bookkeeping', 'bookkeeping-cleanup', 1),
    ('bookkeeping', 'Bank & account reconciliation', 'bank-reconciliation', 2),
    ('payroll', 'Payroll setup', 'payroll-setup', 0),
    ('payroll', 'Ongoing payroll processing', 'payroll-processing', 1),
    ('payroll', 'Payroll tax filings', 'payroll-tax-filings', 2),
    ('business-services', 'Business formation / entity setup', 'business-formation', 0),
    ('business-services', 'EIN & registration', 'ein-registration', 1),
    ('business-services', 'Registered agent / compliance filings', 'registered-agent-compliance', 2),
    ('business-services', 'Business consulting / advisory', 'business-consulting', 3)
) as v(category_slug, name, slug, display_order) on v.category_slug = new_categories.slug;
