
do $$
declare
  v_1040 uuid;
  v_bookkeeping uuid;
  v_payroll uuid;
  v_formation uuid;
  v_compliance uuid;
  v_individual_tax_service uuid;
begin
  insert into document_folder_templates (workspace_id, name, module, status)
  values (null, '1040 Individual Return', 'tax_office', 'published') returning id into v_1040;
  insert into document_folder_template_items (document_folder_template_id, name, display_order) values
    (v_1040, 'Tax Organizer', 1),
    (v_1040, 'Identity Documents', 2),
    (v_1040, 'Income', 3),
    (v_1040, 'Expenses', 4),
    (v_1040, 'Credits', 5),
    (v_1040, 'Filed Return', 6),
    (v_1040, 'IRS Notices', 7),
    (v_1040, 'Correspondence', 8);

  insert into document_folder_templates (workspace_id, name, module, status)
  values (null, 'Bookkeeping', 'bookkeeping', 'published') returning id into v_bookkeeping;
  insert into document_folder_template_items (document_folder_template_id, name, display_order) values
    (v_bookkeeping, 'Bank Statements', 1),
    (v_bookkeeping, 'Receipts', 2),
    (v_bookkeeping, 'Invoices', 3),
    (v_bookkeeping, 'Payroll Reports', 4),
    (v_bookkeeping, 'Financial Statements', 5),
    (v_bookkeeping, 'Year End', 6);

  insert into document_folder_templates (workspace_id, name, module, status)
  values (null, 'Payroll', 'payroll', 'published') returning id into v_payroll;
  insert into document_folder_template_items (document_folder_template_id, name, display_order) values
    (v_payroll, 'Employee Documents', 1),
    (v_payroll, 'Payroll Reports', 2),
    (v_payroll, 'Quarterlies', 3),
    (v_payroll, 'Tax Deposits', 4);

  insert into document_folder_templates (workspace_id, name, module, status)
  values (null, 'Business Formation', 'business_formation', 'published') returning id into v_formation;
  insert into document_folder_template_items (document_folder_template_id, name, display_order) values
    (v_formation, 'Articles', 1),
    (v_formation, 'Operating Agreement', 2),
    (v_formation, 'EIN', 3),
    (v_formation, 'State Filings', 4);

  insert into document_folder_templates (workspace_id, name, module, status)
  values (null, 'Compliance', 'compliance', 'published') returning id into v_compliance;
  insert into document_folder_template_items (document_folder_template_id, name, display_order) values
    (v_compliance, 'Licenses', 1),
    (v_compliance, 'Annual Reports', 2),
    (v_compliance, 'Renewals', 3);

  select id into v_individual_tax_service from services where slug = 'individual-tax-preparation';
  if v_individual_tax_service is not null then
    update services set document_folder_template_id = v_1040 where id = v_individual_tax_service;
  end if;
end $$;
