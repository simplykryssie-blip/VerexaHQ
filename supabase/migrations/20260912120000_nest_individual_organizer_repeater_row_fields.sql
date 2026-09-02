-- Follow-up to 20260912110000_fix_individual_organizer_self_parented_fields.sql.
-- That migration correctly made 232 self-parented fields visible again on
-- both copies of "2026 Individual Tax Organizer" (MKB Financial Group's real
-- production template and Summit's demo copy) by resetting parent_field_id to
-- NULL -- but treated every one of them as a flat top-level question. Closer
-- inspection shows ALL 232 are actually meant to be per-row detail fields for
-- the repeating_section immediately preceding them (e.g. "Property address",
-- "Days rented", "Gross rental income" etc. directly following the "Rental
-- properties" repeater, before the next section/page-break boundary) --
-- every one of the 29 repeating sections in both templates currently has zero
-- real children, which would otherwise leave "+ Add another" producing empty
-- rows with nothing to fill in.
--
-- This nests each of the 232 fields under the repeating_section it
-- structurally belongs to (identified by position: strictly between that
-- repeater and the next section/repeating_section/page_break boundary --
-- verified this covers all 232 fields in both templates with no leftovers).
--
-- A few of them (30 per template) carry a conditional_logic show_if that
-- references a top-level field outside their own row -- almost always just a
-- redundant copy of the same condition that already gates the repeating
-- section itself (e.g. "Approximate move-in date" repeating "Did you live in
-- more than one state? = Yes", which already gates the whole "States lived
-- in" repeater). Once nested, a repeater row's conditional_logic is evaluated
-- against that row's own local answers only (see
-- components/settings/organizer-builder/OrganizerPreviewPanel.tsx
-- PreviewRepeatingSection and components/portal/OrganizerForm.tsx) -- a
-- reference to a field outside the row can never resolve, which would
-- silently hide the field inside every row permanently. Clearing these
-- (leaving them unconditional, matching every other clean per-row sibling)
-- is the same fix already applied to a lone spurious self-condition in the
-- original two ghost-conditional-logic migrations. 5 per template legitimately
-- reference a fellow child of the same repeater (the dependent-information
-- block's "how many months did they live with you" / "what school" /
-- "custody agreement" follow-ups) and are left untouched.
with boundaries as (
  select organizer_template_id, id, field_type, display_order,
    lead(display_order) over (partition by organizer_template_id order by display_order) as next_boundary
  from organizer_fields
  where organizer_template_id in ('6951abd2-6705-4e92-be7a-17a9a1292692', '68d8af0a-272c-48c3-bc76-0e72a6d2b4c7')
  and field_type in ('repeating_section', 'section', 'page_break')
),
repeater_ranges as (
  select organizer_template_id, id as repeater_id, display_order as repeater_order, next_boundary
  from boundaries
  where field_type = 'repeating_section'
),
children_to_nest as (
  select f.id as field_id, f.organizer_template_id, r.repeater_id, f.conditional_logic
  from organizer_fields f
  join repeater_ranges r on r.organizer_template_id = f.organizer_template_id
    and f.display_order > r.repeater_order
    and (r.next_boundary is null or f.display_order < r.next_boundary)
  where f.updated_at = '2026-09-02 03:54:45.051587+00'
)
update organizer_fields f
set parent_field_id = c.repeater_id
from children_to_nest c
where f.id = c.field_id;

-- Second pass: now that parent_field_id reflects the real nesting, clear any
-- child's conditional_logic that references a field outside its own row.
with boundaries as (
  select organizer_template_id, id, field_type, display_order,
    lead(display_order) over (partition by organizer_template_id order by display_order) as next_boundary
  from organizer_fields
  where organizer_template_id in ('6951abd2-6705-4e92-be7a-17a9a1292692', '68d8af0a-272c-48c3-bc76-0e72a6d2b4c7')
  and field_type in ('repeating_section', 'section', 'page_break')
),
repeater_ranges as (
  select organizer_template_id, id as repeater_id, display_order as repeater_order, next_boundary
  from boundaries
  where field_type = 'repeating_section'
),
nested_children as (
  select f.id, f.organizer_template_id, f.parent_field_id, f.conditional_logic
  from organizer_fields f
  where f.updated_at = '2026-09-02 03:54:45.051587+00'
  and f.parent_field_id is not null
),
needs_clearing as (
  select nc.id
  from nested_children nc
  where nc.conditional_logic -> 'show_if' -> 'conditions' is not null
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
