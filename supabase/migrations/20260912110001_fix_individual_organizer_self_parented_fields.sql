-- Both copies of "2026 Individual Tax Organizer" -- MKB Financial Group's real
-- production template (6951abd2-6705-4e92-be7a-17a9a1292692) and Summit's demo
-- copy (68d8af0a-272c-48c3-bc76-0e72a6d2b4c7), tracing back to the same
-- clone/rebuild bug already documented in
-- 20260901120000_fix_individual_organizer_ghost_conditional_logic.sql and
-- 20260901121000_fix_mkb_individual_organizer_ghost_conditional_logic.sql --
-- each have 232 fields whose parent_field_id was set to their OWN id instead
-- of NULL. A field can't legitimately be its own parent: organizer_fields
-- self-referencing rows never render anywhere (OrganizerBuilder.tsx,
-- OrganizerPreviewPanel.tsx, and the real client-facing
-- components/portal/OrganizerForm.tsx and components/organizer/PublicOrganizerForm.tsx
-- all compute "top level" as `!parent_field_id`, and no repeating_section in
-- either template legitimately owns any of these ids as a real child either --
-- confirmed there are zero real parent_field_id -> repeating_section children
-- in either template).
--
-- Inspecting the affected rows (ordinary conditional follow-ups like
-- "Approximate move-in date", "Did you maintain a home there?", "Dependent
-- relationship to taxpayer") confirms they are meant to be top-level fields
-- whose visibility is governed by their own conditional_logic column (already
-- present and already fixed by the prior two migrations), not nested
-- children of anything. Restoring parent_field_id to NULL is what makes them
-- visible again -- to staff building the organizer, to the builder's preview,
-- and to real clients filling out the real form. This has been silently
-- hiding ~28% of both organizers' questions.
update organizer_fields
set parent_field_id = null
where organizer_template_id in (
  '6951abd2-6705-4e92-be7a-17a9a1292692', -- MKB Financial Group LLC
  '68d8af0a-272c-48c3-bc76-0e72a6d2b4c7'  -- Summit Tax & Financial Services (PTIN demo)
)
and parent_field_id = id;
