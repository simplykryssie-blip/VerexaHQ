-- organizer_fields.conditional_logic show_if conditions that target a
-- yes_no parent field must compare against the value the frontend actually
-- writes ('yes'/'no', see YES_NO_OPTIONS in PublicOrganizerForm.tsx and
-- FieldPropertiesPanel.tsx), not the capitalized display label ("Yes").
-- Found live while QA-testing the "Individual Tax Return Intake --
-- Streamlined" organizer in the PTIN demo workspace: a dependent field's
-- show_if compared against "Yes", which the equals operator (strict ===)
-- never matches against the real stored "yes" -- so the field could never
-- appear no matter how the parent question was answered.
--
-- The exact same mistake was found identically in a second, real
-- non-demo customer workspace (MKB Financial Group LLC), in the same two
-- organizer templates, affecting 20 fields total across both workspaces --
-- confirming this isn't demo-specific content, and the fix must reach both
-- already-created and not-yet-created workspaces equally. The current
-- organizer builder UI (FieldPropertiesPanel.tsx) already renders a proper
-- dropdown sourced from the parent field's own options for yes_no/choice
-- conditions, so this could not be introduced through today's UI -- this is
-- legacy data predating that safeguard, not a live authoring bug.
--
-- This UPDATE is written generically (not scoped to specific field ids or
-- workspaces) so it repairs every current instance of the mistake and is a
-- no-op for any field that doesn't have it, rather than only the ones this
-- investigation happened to find.

update public.organizer_fields target
set conditional_logic = jsonb_set(
  target.conditional_logic,
  '{show_if,conditions}',
  coalesce((
    select jsonb_agg(
      case
        when cond->>'value' = 'Yes'
          and cond->>'field_id' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          and (select p.field_type from public.organizer_fields p where p.id = (cond->>'field_id')::uuid) = 'yes_no'
        then jsonb_set(cond, '{value}', '"yes"'::jsonb)
        else cond
      end
      order by ord
    )
    from jsonb_array_elements(target.conditional_logic->'show_if'->'conditions') with ordinality as t(cond, ord)
  ), target.conditional_logic->'show_if'->'conditions')
)
where jsonb_typeof(target.conditional_logic->'show_if'->'conditions') = 'array';
