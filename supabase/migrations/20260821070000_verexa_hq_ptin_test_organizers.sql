-- Verexa HQ CRM (independent_ptin, 74321fb2-9a18-4625-ab12-01c98e888667) is
-- the owner's own testing sandbox. Builds 4 simple, workspace-owned test
-- organizers + services (Individual tax return, Business tax return,
-- Bookkeeping, Amended return & IRS resolution) -- short intake forms, not
-- full 100+ field organizers, since these exist purely to exercise the
-- platform. Uses this workspace's own service_categories copies (seeded by
-- copy_preloaded_templates_to_workspace in the prior migration), never the
-- shared workspace_id-IS-NULL taxonomy rows directly.
do $$
declare
  v_workspace_id uuid := '74321fb2-9a18-4625-ab12-01c98e888667';
  v_cat_tax_prep uuid;
  v_cat_bookkeeping uuid;
  v_org_individual uuid := gen_random_uuid();
  v_org_business uuid := gen_random_uuid();
  v_org_bookkeeping uuid := gen_random_uuid();
  v_org_amended uuid := gen_random_uuid();
begin
  select id into v_cat_tax_prep from public.service_categories where workspace_id = v_workspace_id and slug = 'tax-preparation';
  select id into v_cat_bookkeeping from public.service_categories where workspace_id = v_workspace_id and slug = 'bookkeeping';

  -- Individual tax return
  insert into public.organizer_templates (id, workspace_id, name, slug, description, status)
  values (v_org_individual, v_workspace_id, 'Individual Tax Return Organizer', 'individual-tax-return-organizer', 'Quick intake for an individual (1040) tax return.', 'published');

  insert into public.organizer_fields (organizer_template_id, field_type, label, display_order, is_required, options) values
  (v_org_individual, 'section', 'Filing Info', 0, false, '[]'),
  (v_org_individual, 'dropdown', 'Filing status', 1, true, '[{"label":"Single","value":"Single"},{"label":"Married Filing Jointly","value":"Married Filing Jointly"},{"label":"Married Filing Separately","value":"Married Filing Separately"},{"label":"Head of Household","value":"Head of Household"},{"label":"Qualifying Surviving Spouse","value":"Qualifying Surviving Spouse"}]'),
  (v_org_individual, 'yes_no', 'Do you have any dependents?', 2, true, '[]'),
  (v_org_individual, 'number', 'How many dependents?', 3, false, '[]'),
  (v_org_individual, 'yes_no', 'Did you have W-2 income this year?', 4, true, '[]'),
  (v_org_individual, 'yes_no', 'Did you have any 1099 or self-employment income this year?', 5, true, '[]'),
  (v_org_individual, 'yes_no', 'Do you own a home?', 6, false, '[]'),
  (v_org_individual, 'paragraph', 'Anything else we should know?', 7, false, '[]');

  insert into public.services (workspace_id, service_category_id, name, slug, status, organizer_template_id, requires_organizer, is_portal_visible, display_order)
  values (v_workspace_id, v_cat_tax_prep, 'Individual Tax Return', 'individual-tax-return', 'published', v_org_individual, true, true, 0);

  -- Business tax return
  insert into public.organizer_templates (id, workspace_id, name, slug, description, status)
  values (v_org_business, v_workspace_id, 'Business Tax Return Organizer', 'business-tax-return-organizer', 'Quick intake for a business entity tax return.', 'published');

  insert into public.organizer_fields (organizer_template_id, field_type, label, display_order, is_required, options) values
  (v_org_business, 'section', 'Business Info', 0, false, '[]'),
  (v_org_business, 'short_text', 'Business name', 1, true, '[]'),
  (v_org_business, 'dropdown', 'Entity type', 2, true, '[{"label":"Sole Proprietorship","value":"Sole Proprietorship"},{"label":"Partnership","value":"Partnership"},{"label":"S-Corporation","value":"S-Corporation"},{"label":"C-Corporation","value":"C-Corporation"},{"label":"LLC","value":"LLC"}]'),
  (v_org_business, 'ein', 'EIN', 3, true, '[]'),
  (v_org_business, 'yes_no', 'Did the business have employees this year?', 4, true, '[]'),
  (v_org_business, 'currency', 'Approximate annual revenue', 5, false, '[]'),
  (v_org_business, 'paragraph', 'Anything else we should know?', 6, false, '[]');

  insert into public.services (workspace_id, service_category_id, name, slug, status, organizer_template_id, requires_organizer, is_portal_visible, display_order)
  values (v_workspace_id, v_cat_tax_prep, 'Business Tax Return', 'business-tax-return', 'published', v_org_business, true, true, 1);

  -- Bookkeeping
  insert into public.organizer_templates (id, workspace_id, name, slug, description, status)
  values (v_org_bookkeeping, v_workspace_id, 'Bookkeeping Organizer', 'bookkeeping-organizer', 'Quick intake for a bookkeeping engagement.', 'published');

  insert into public.organizer_fields (organizer_template_id, field_type, label, display_order, is_required, options) values
  (v_org_bookkeeping, 'section', 'Bookkeeping Info', 0, false, '[]'),
  (v_org_bookkeeping, 'dropdown', 'How often do you need bookkeeping?', 1, true, '[{"label":"Monthly","value":"Monthly"},{"label":"Quarterly","value":"Quarterly"},{"label":"Annual cleanup","value":"Annual cleanup"}]'),
  (v_org_bookkeeping, 'yes_no', 'Do you currently use accounting software?', 2, true, '[]'),
  (v_org_bookkeeping, 'short_text', 'Which software (if any)?', 3, false, '[]'),
  (v_org_bookkeeping, 'number', 'Approximate number of monthly transactions', 4, false, '[]'),
  (v_org_bookkeeping, 'paragraph', 'Anything else we should know?', 5, false, '[]');

  insert into public.services (workspace_id, service_category_id, name, slug, status, organizer_template_id, requires_organizer, is_portal_visible, display_order)
  values (v_workspace_id, v_cat_bookkeeping, 'Bookkeeping', 'bookkeeping', 'published', v_org_bookkeeping, true, true, 0);

  -- Amended return & IRS resolution
  insert into public.organizer_templates (id, workspace_id, name, slug, description, status)
  values (v_org_amended, v_workspace_id, 'Amended Return & IRS Resolution Organizer', 'amended-return-irs-resolution-organizer', 'Quick intake for an amendment or IRS notice/resolution case.', 'published');

  insert into public.organizer_fields (organizer_template_id, field_type, label, display_order, is_required, options) values
  (v_org_amended, 'section', 'Amendment / IRS Details', 0, false, '[]'),
  (v_org_amended, 'dropdown', 'What do you need help with?', 1, true, '[{"label":"Amend a prior return","value":"Amend a prior return"},{"label":"Respond to an IRS notice","value":"Respond to an IRS notice"},{"label":"Audit representation","value":"Audit representation"},{"label":"Other","value":"Other"}]'),
  (v_org_amended, 'date', 'Tax year in question', 2, true, '[]'),
  (v_org_amended, 'file_upload', 'Upload any IRS notice or letter you received', 3, false, '[]'),
  (v_org_amended, 'paragraph', 'Briefly describe the issue', 4, true, '[]');

  insert into public.services (workspace_id, service_category_id, name, slug, status, organizer_template_id, requires_organizer, is_portal_visible, display_order)
  values (v_workspace_id, v_cat_tax_prep, 'Amended Return & IRS Resolution', 'amended-return-irs-resolution', 'published', v_org_amended, true, true, 2);
end $$;
