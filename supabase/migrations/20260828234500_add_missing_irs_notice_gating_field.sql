-- Companion fix to 20260828233000_fix_organizer_yes_no_condition_casing.sql.
-- That migration repaired show_if conditions whose value casing didn't match
-- stored yes_no answers, but skipped 4 fields in Summit's "Amended Return &
-- IRS Resolution Organizer" (organizer_templates.id = 70e3698d-54f7-42f5-
-- b915-678e4f78c997) because their field_id ("b2ffeb69-640a-42e3-92ff-
-- 0b9818dcb5") isn't even a valid UUID and matches no real field -- these 4
-- fields could never appear under any circumstance.
--
-- The surrounding template layout makes the intent clear: a "Notice &
-- IRS/State Contact" section header sits at display_order 31, immediately
-- followed by two fields (display_order 32-33) that were clearly meant to
-- be gated behind "did you receive a notice", then a sibling standalone
-- yes_no question ("Have you contacted the IRS or state agency about this
-- matter?") at display_order 34, then two more fields (35-36) with the
-- same broken reference. The gating question itself is simply missing from
-- the template -- this adds it back and re-points the 4 orphaned
-- conditions at it, using the corrected lowercase "yes" value convention.
--
-- Scoped to this one template/workspace since this is workspace-owned
-- template content, not a platform-wide pattern (confirmed no other
-- workspace has this template).

do $$
declare
  v_template_id uuid := '70e3698d-54f7-42f5-b915-678e4f78c997';
  v_new_field_id uuid;
begin
  update public.organizer_fields
  set display_order = display_order + 1
  where organizer_template_id = v_template_id
    and display_order >= 32;

  insert into public.organizer_fields (
    organizer_template_id, parent_field_id, field_type, label, help_text,
    display_order, is_required, options, conditional_logic, layout_width
  ) values (
    v_template_id, null, 'yes_no',
    'Did you receive an IRS or state notice regarding this matter?',
    'Select yes if you received any letter, notice, or other correspondence from the IRS or a state tax agency about this issue.',
    32, true, '[]'::jsonb, '{}'::jsonb, 'full'
  )
  returning id into v_new_field_id;

  update public.organizer_fields
  set conditional_logic = jsonb_set(
    conditional_logic,
    '{show_if,conditions}',
    (
      select jsonb_agg(
        case
          when cond->>'field_id' = 'b2ffeb69-640a-42e3-92ff-0b9818dcb5'
          then jsonb_build_object('field_id', v_new_field_id::text, 'operator', cond->>'operator', 'value', 'yes')
          else cond
        end
      )
      from jsonb_array_elements(conditional_logic->'show_if'->'conditions') as cond
    )
  )
  where id in (
    '0b904819-87bc-4a04-86fc-9b1998ec99cd',
    '95b00543-ee1d-4d06-9eb4-2e7af99d5145',
    'ddd524c6-10af-40b1-a2fc-bb4c5d934539',
    'df7e2e4b-7ab0-4744-8547-75d27baf636b'
  );
end $$;
