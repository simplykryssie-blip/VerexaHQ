-- Same fix as the Form 1040 template's top-level name field, applied to the
-- Dependents repeating section's own First name/Last name child fields --
-- confirmed zero organizer_response_answers exist for either yet. Repeater
-- children are never mapped to client_profile_field (a repeating section
-- can't correspond to a single client record), so this is a pure UX
-- improvement (one grouped input instead of two boxes), not a prefill change.
update public.organizer_fields
set field_type = 'name', label = 'Full name'
where id = 'bfff3994-2ba8-4785-9cb1-17a08ab0adea';

delete from public.organizer_fields where id = 'fd24f7ff-9ff3-41c7-b71b-3166b3d5f1e4';
