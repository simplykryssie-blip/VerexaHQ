-- Bug found during the 16-point verification pass immediately after applying
-- 20260926065620_mkb_bookkeeping_assessment_upgrade.sql: the "Are all active
-- financial accounts currently reconciled?" field was inserted with
-- gen_random_uuid() instead of the intended synthetic id
-- a1100000-0000-0000-0000-000000000001, leaving its dependent field
-- ("Which accounts are not currently reconciled?") pointed at a
-- non-existent field_id -- that follow-up question could never have shown,
-- since its show_if condition could never match any real answer.
--
-- Repoints the dependent field's show_if at the real id Postgres actually
-- generated (9c4be660-9453-4836-b698-bb6faa0c4c06) rather than changing the
-- trigger field's own id post-hoc. The source migration file has separately
-- been corrected to use the synthetic literal id from the start, so a fresh
-- apply of this template never needs this follow-up statement again -- this
-- file exists only to keep local migration history matching what was
-- actually run against production.
update public.organizer_fields
set conditional_logic = '{"show_if":{"match":"any","conditions":[{"field_id":"9c4be660-9453-4836-b698-bb6faa0c4c06","operator":"equals","value":"no"},{"field_id":"9c4be660-9453-4836-b698-bb6faa0c4c06","operator":"equals","value":"some_are_reconciled"}]}}'::jsonb
where organizer_template_id = '283d6989-94b2-45d8-8eed-4f91702950f1'
and label = 'Which accounts are not currently reconciled?';
