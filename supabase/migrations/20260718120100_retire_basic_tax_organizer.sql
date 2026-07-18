update public.tax_organizer_templates
set is_active = false
where template_name in ('Basic 1040', 'Basic 1040 Tax Organizer')
  and exists (
    select 1 from public.tax_organizer_templates
    where template_name = 'Comprehensive Individual Income Tax Organizer'
      and is_active = true
  );

