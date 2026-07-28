-- Client-First System Template Experience (docs/product-standards/
-- client-first-system-template-standard.md). Purely additive columns
-- supporting the new question-format fields. Applies to every template
-- row (system and firm-created alike) -- the standard itself only
-- governs which templates get their *content* rewritten
-- (is_platform_template = true); firm templates keep these columns
-- available but empty/untouched.

alter table public.tax_organizer_questions add column if not exists explanation text;
alter table public.tax_organizer_questions add column if not exists example_text text;
alter table public.tax_organizer_questions add column if not exists placeholder text;
alter table public.tax_organizer_questions add column if not exists not_sure_text text;
alter table public.tax_organizer_questions add column if not exists format_type text;

alter table public.tax_organizer_questions drop constraint if exists tax_organizer_questions_format_type_check;
alter table public.tax_organizer_questions add constraint tax_organizer_questions_format_type_check check (
  format_type is null or format_type in ('ssn', 'ein', 'phone', 'zip', 'currency', 'percentage')
);

alter table public.tax_organizer_sections add column if not exists estimated_minutes integer;
alter table public.tax_organizer_sections drop constraint if exists tax_organizer_sections_estimated_minutes_check;
alter table public.tax_organizer_sections add constraint tax_organizer_sections_estimated_minutes_check check (
  estimated_minutes is null or estimated_minutes > 0
);
