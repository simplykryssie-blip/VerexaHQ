-- The second pass of 20260912120000_nest_individual_organizer_repeater_row_fields.sql
-- (clearing conditional_logic on newly-nested fields that reference a field
-- outside their own row) silently did nothing: it filtered on
-- `updated_at = '2026-09-02 03:54:45.051587+00'`, but the first pass's own
-- UPDATE (setting parent_field_id) bumped that same updated_at column via
-- organizer_fields' update trigger, so by the time the second statement ran,
-- none of the 232 rows still carried that timestamp and zero rows matched.
--
-- Re-running the same logic here using parent_field_id instead of the
-- now-stale timestamp -- every currently-nested field in these two templates
-- is exactly the set the prior migration nested (both templates had zero
-- real repeating_section children before it ran), so this is an equivalent,
-- timestamp-independent way to reach the same 30-per-template fields whose
-- condition references something outside their own repeater row (almost
-- always a redundant copy of the condition that already gates the
-- repeating_section itself, e.g. "1099-INT received?" repeating "income
-- types includes interest" when the "Interest accounts" repeater already
-- only shows for that same reason) and clear them, leaving the 5-per-template
-- legitimate sibling-to-sibling conditions (in the dependent-information
-- block) untouched.
with needs_clearing as (
  select nc.id
  from organizer_fields nc
  where nc.organizer_template_id in ('6951abd2-6705-4e92-be7a-17a9a1292692', '68d8af0a-272c-48c3-bc76-0e72a6d2b4c7')
  and nc.parent_field_id is not null
  and nc.conditional_logic -> 'show_if' -> 'conditions' is not null
  and exists (
    select 1
    from jsonb_array_elements(nc.conditional_logic -> 'show_if' -> 'conditions') cond
    where not exists (
      select 1 from organizer_fields sib
      where sib.organizer_template_id = nc.organizer_template_id
      and sib.parent_field_id = nc.parent_field_id
      and sib.id = (cond ->> 'field_id')::uuid
    )
  )
)
update organizer_fields f
set conditional_logic = '{}'::jsonb
from needs_clearing nc
where f.id = nc.id;
