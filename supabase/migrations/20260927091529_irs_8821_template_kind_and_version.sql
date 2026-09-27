alter table public.engagement_letter_templates
  add column form_kind text,
  add column form_version text;

alter table public.engagement_letter_templates
  add constraint engagement_letter_templates_form_kind_check
  check (form_kind is null or form_kind in ('irs_8821'));

update public.engagement_letter_templates
set form_kind = 'irs_8821', form_version = '2021-01'
where id = '0db04744-964f-43ea-9004-eab50c85ead1';
