-- Phase 5 pipeline sweep: two organizer fields had conditional_logic pointing
-- at a field_id that only exists in a DIFFERENT organizer template
-- (Bookkeeping Organizer), not their own -- almost certainly leftover from
-- copy-pasting a similar question between templates during authoring
-- without updating the referenced field_id.
--
-- Since the referenced field never exists in the rendered form's own answer
-- state, both conditions can never evaluate true, so these fields silently
-- never show for any client filling out the form:
--   - Payroll Intake Organizer: "Anything special about payroll?" pointed at
--     Bookkeeping Organizer's "Does the business run payroll?" field.
--   - Business Tax Return Organizer: "Did the business purchase supplies or
--     inventory?" pointed at a Bookkeeping Organizer field.
--
-- Every sibling field in both of these fields' own sections is unconditional
-- (plain yes/no or closing free-text questions with no gating), so the fix
-- is to clear the stray condition rather than invent a new one -- these
-- fields should simply always display, matching their neighbors.
--
-- Both templates are unique to the Summit Tax & Financial Services demo
-- workspace (confirmed: no other workspace has a template with either name),
-- so this is a complete, workspace-agnostic fix -- there is no shared seed
-- copy elsewhere that also needs correcting.

update public.organizer_fields
set conditional_logic = '{}'::jsonb
where id in (
  '79021e00-40a3-40f3-b2dc-82c57dcb2c32', -- Payroll Intake Organizer: "Anything special about payroll?"
  '6cb254ee-4445-4dfb-934b-e9cb8070ed50'  -- Business Tax Return Organizer: "Did the business purchase supplies or inventory?"
);
