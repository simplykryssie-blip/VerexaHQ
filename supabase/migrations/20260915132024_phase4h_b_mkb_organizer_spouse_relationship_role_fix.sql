-- ============================================================================
-- MIGRATION RECONCILIATION PHASE 1.9 -- RECOVERED FROM PRODUCTION (PR #268)
--
-- Did not previously exist in Git main. Applied directly to production
-- during the MKB Tax Prep + Client Review + F1/F2/NW-1 security work
-- (PR #268, branch claude/verexa-schema-mismatch-i8c19u, never merged).
-- This filename's version already exactly matches the real recorded
-- production version in supabase_migrations.schema_migrations -- no rename
-- needed. Content verified byte-for-byte (modulo a single trailing
-- newline) against schema_migrations.statements. Confidence: A -- exact
-- original recovered.
-- ============================================================================
-- Phase 4H-B: corrects two mistagged relationship_role values on MKB's real
-- organizer ("2027 INDIVIDUAL/ SCH C INTAKE FORM", 578c6135-3978-48d4-a3a1-
-- 539cd5bd1e0f), discovered in Phase 4H-A while building an F2 test fixture.
--
-- Audited live before this change (Phase 4H-B, Section 6):
--   - display_order 45-50 of this organizer form a single "Spouse Profile"
--     section, all conditional on "Do you need to add a spouse" = Yes:
--       48 "Name"                -> tagged relationship_role='dependent_relationship_other' (WRONG)
--       49 "Spouse Date of Birth" -> tagged relationship_role='spouse_dob'   (already correct)
--       50 "Spouse SSN/ ITIN"     -> tagged relationship_role='dependent_relationship_other' (WRONG)
--   - sync_client_relationships_for_response() only ever reads spouse data
--     from fields tagged 'spouse_full_name'/'spouse_dob'/'spouse_ssn', and
--     only inserts a spouse client_relationships row when the aggregated
--     spouse name is non-null/non-empty. With fields 48/50 mistagged, that
--     name is always null, so today NO spouse relationship row is ever
--     created for a real MKB client -- the sync is not merely inaccurate,
--     it never fires at all.
--   - The dependent-relationship loop (grouped by instance_index, gated on
--     a non-null 'dependent_full_name') is likewise never triggered by
--     these two fields, because neither is tagged 'dependent_full_name' --
--     so today's mistagged values produce zero effect on either path, in
--     either direction. Correcting the tags therefore has no existing
--     downstream behavior to break.
--   - No other MKB organizer template (Partner Software and Bank
--     Application, Tax Preparer Contract, Partnership and S-Corp Intake
--     Form) has any relationship_role-tagged fields at all -- this is an
--     isolated, two-field correction.
--
-- No question text, ordering, conditional logic, or required/optional
-- state is changed -- only the relationship_role value on these two fields.
update public.organizer_fields
set relationship_role = 'spouse_full_name'
where id = 'c52252f0-0d91-40c0-bb64-5a9b8c946551'
  and organizer_template_id = '578c6135-3978-48d4-a3a1-539cd5bd1e0f'
  and relationship_role = 'dependent_relationship_other';

update public.organizer_fields
set relationship_role = 'spouse_ssn'
where id = '56ce5ffb-6412-4dfa-bce8-1adba9c3051f'
  and organizer_template_id = '578c6135-3978-48d4-a3a1-539cd5bd1e0f'
  and relationship_role = 'dependent_relationship_other';
