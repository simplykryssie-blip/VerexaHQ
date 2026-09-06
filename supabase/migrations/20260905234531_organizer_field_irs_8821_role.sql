-- Sibling to organizer_fields.relationship_role (which already lets a
-- tagged organizer field auto-sync spouse/dependent answers into
-- client_relationships): lets staff tag a field as feeding an IRS Form
-- 8821 authorization's tax-years or specific-tax-matters text, so creating
-- an authorization for a client who already submitted a tagged organizer
-- doesn't require re-asking them. Deliberately narrow -- tax-matter *type*
-- and *form number* are staff judgment calls, not something to pull from a
-- client answer, so they're not part of this vocabulary.
alter table public.organizer_fields add column irs_8821_role text;

alter table public.organizer_fields add constraint organizer_fields_irs_8821_role_check
  check (irs_8821_role is null or irs_8821_role = any (array['tax_years_periods'::text, 'specific_tax_matters'::text]));
