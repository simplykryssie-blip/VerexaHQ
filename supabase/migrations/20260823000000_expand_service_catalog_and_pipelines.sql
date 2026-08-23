-- Fixing intake: today only 4 services exist and only 1 (Individual Tax
-- Return) has a pipeline; the other 3 have none, and 5 real offerings
-- (Payroll, Business Services, Tax Planning, Extensions, Consulting &
-- Advisory) don't exist as services at all. This gives every real offering
-- its own service row + dedicated pipeline. No new "Services" management
-- UI -- services stays a plain backend catalog table, same as it already
-- was; only /pipelines and /workflows get new content, no new pages.
--
-- Renames "Business Tax Return" -> "Business Tax Prep", "Amended Return
-- & IRS Resolution" -> "Amendments" (IRS resolution work is explicitly
-- out of scope, not a service offered right now), and "Individual Tax
-- Return" -> "Individual Tax Prep" to match the real service list, and
-- adds the 5 missing services with their own pipelines. Individual Tax
-- Prep's existing 14-stage pipeline is left untouched.

do $$
declare
  v_workspace_id uuid := '74321fb2-9a18-4625-ab12-01c98e888667';
  v_tax_prep_category_id uuid := '8a08ee0d-9c11-4cfb-bc7c-3a1d44663ac2';
  v_bookkeeping_category_id uuid := '7d164735-b09b-4ad3-8994-477a33ab0aac';
  v_payroll_category_id uuid := '14588bc5-1eae-4090-ae11-ddddd3f94d77';
  v_business_services_category_id uuid := '464047b9-fe9e-40a1-9939-8f8c2782e19e';
  v_consulting_category_id uuid;
  v_business_tax_service_id uuid := '7b251c3f-2759-41b1-b7d4-175e33c4397e';
  v_bookkeeping_service_id uuid := 'd0ada413-bf5a-4c71-8cd6-cb5624eab936';
  v_amendments_service_id uuid := '2286d7f8-d5e9-4405-8789-afcdcdbdc705';
  v_individual_tax_service_id uuid := '2df4fcc9-b79a-4d55-8e43-b939a43e3a24';
  v_process_id uuid;
  v_service_id uuid;
  v_stage_names text[];
  v_i int;
begin
  -- Renames matching the confirmed real service list.
  update public.services set name = 'Business Tax Prep' where id = v_business_tax_service_id;
  update public.services set name = 'Amendments' where id = v_amendments_service_id;
  update public.services set name = 'Individual Tax Prep' where id = v_individual_tax_service_id;

  -- New category for the one service that doesn't fit an existing bucket.
  insert into public.service_categories (workspace_id, name, slug, display_order)
  values (v_workspace_id, 'Consulting & Advisory', 'consulting-advisory', 5)
  returning id into v_consulting_category_id;

  -- Business Tax Prep pipeline
  insert into public.processes (workspace_id, name, slug, status, created_by)
  values (v_workspace_id, 'Business Tax Prep Pipeline', 'business-tax-prep-pipeline', 'published', null)
  returning id into v_process_id;
  v_stage_names := array['Lead', 'Engagement Letter Signed', 'Organizer Sent', 'Documents Received', 'Preparation', 'Internal Review', 'Client Approval', 'E-Filed', 'Accepted', 'Invoiced', 'Closed'];
  for v_i in 1 .. array_length(v_stage_names, 1) loop
    insert into public.process_stages (process_id, name, display_order) values (v_process_id, v_stage_names[v_i], v_i - 1);
  end loop;
  update public.services set process_id = v_process_id where id = v_business_tax_service_id;

  -- Bookkeeping pipeline
  insert into public.processes (workspace_id, name, slug, status, created_by)
  values (v_workspace_id, 'Bookkeeping Pipeline', 'bookkeeping-pipeline', 'published', null)
  returning id into v_process_id;
  v_stage_names := array['Onboarding', 'Historical Cleanup', 'Chart of Accounts Setup', 'Monthly Reconciliation', 'Financials Delivered', 'Client Review', 'Steady-State', 'Offboarded'];
  for v_i in 1 .. array_length(v_stage_names, 1) loop
    insert into public.process_stages (process_id, name, display_order) values (v_process_id, v_stage_names[v_i], v_i - 1);
  end loop;
  update public.services set process_id = v_process_id where id = v_bookkeeping_service_id;

  -- Amendments pipeline
  insert into public.processes (workspace_id, name, slug, status, created_by)
  values (v_workspace_id, 'Amendments Pipeline', 'amendments-pipeline', 'published', null)
  returning id into v_process_id;
  v_stage_names := array['Intake', 'Original Return Gathered', 'Amendment Prepared', 'Client Approval', 'E-Filed', 'Accepted', 'Invoiced', 'Closed'];
  for v_i in 1 .. array_length(v_stage_names, 1) loop
    insert into public.process_stages (process_id, name, display_order) values (v_process_id, v_stage_names[v_i], v_i - 1);
  end loop;
  update public.services set process_id = v_process_id where id = v_amendments_service_id;

  -- Payroll: new service + pipeline
  insert into public.processes (workspace_id, name, slug, status, created_by)
  values (v_workspace_id, 'Payroll Pipeline', 'payroll-pipeline', 'published', null)
  returning id into v_process_id;
  v_stage_names := array['Onboarding', 'Employee Data Collection', 'System Setup', 'First Run', 'Ongoing Processing', 'Quarterly Filings', 'Year-End W2/1099', 'Offboarded'];
  for v_i in 1 .. array_length(v_stage_names, 1) loop
    insert into public.process_stages (process_id, name, display_order) values (v_process_id, v_stage_names[v_i], v_i - 1);
  end loop;
  insert into public.services (workspace_id, service_category_id, name, slug, process_id, is_bookable, is_portal_visible, requires_organizer, requires_engagement_letter, requires_documents, requires_signature, requires_review, requires_invoice, requires_payment_before_release, status)
  values (v_workspace_id, v_payroll_category_id, 'Payroll', 'payroll', v_process_id, false, true, false, false, false, false, false, true, false, 'published');

  -- Business Services: new service + pipeline
  insert into public.processes (workspace_id, name, slug, status, created_by)
  values (v_workspace_id, 'Business Services Pipeline', 'business-services-pipeline', 'published', null)
  returning id into v_process_id;
  v_stage_names := array['Intake', 'Info Gathering', 'Filing Prepared', 'Filed with State', 'Confirmed / EIN Received', 'Documents Delivered', 'Closed'];
  for v_i in 1 .. array_length(v_stage_names, 1) loop
    insert into public.process_stages (process_id, name, display_order) values (v_process_id, v_stage_names[v_i], v_i - 1);
  end loop;
  insert into public.services (workspace_id, service_category_id, name, slug, process_id, is_bookable, is_portal_visible, requires_organizer, requires_engagement_letter, requires_documents, requires_signature, requires_review, requires_invoice, requires_payment_before_release, status)
  values (v_workspace_id, v_business_services_category_id, 'Business Services', 'business-services', v_process_id, false, true, false, false, false, false, false, true, false, 'published');

  -- Tax Planning: new service + pipeline
  insert into public.processes (workspace_id, name, slug, status, created_by)
  values (v_workspace_id, 'Tax Planning Pipeline', 'tax-planning-pipeline', 'published', null)
  returning id into v_process_id;
  v_stage_names := array['Discovery Call', 'Financial Data Gathered', 'Strategy Developed', 'Plan Presented', 'Client Decision', 'Implemented', 'Follow-up Review', 'Closed'];
  for v_i in 1 .. array_length(v_stage_names, 1) loop
    insert into public.process_stages (process_id, name, display_order) values (v_process_id, v_stage_names[v_i], v_i - 1);
  end loop;
  insert into public.services (workspace_id, service_category_id, name, slug, process_id, is_bookable, is_portal_visible, requires_organizer, requires_engagement_letter, requires_documents, requires_signature, requires_review, requires_invoice, requires_payment_before_release, status)
  values (v_workspace_id, v_tax_prep_category_id, 'Tax Planning', 'tax-planning', v_process_id, false, true, false, false, false, false, false, true, false, 'published');

  -- Extensions: new service + pipeline
  insert into public.processes (workspace_id, name, slug, status, created_by)
  values (v_workspace_id, 'Extensions Pipeline', 'extensions-pipeline', 'published', null)
  returning id into v_process_id;
  v_stage_names := array['Request Received', 'Extension Prepared', 'Filed', 'Confirmed', 'Client Notified', 'Closed'];
  for v_i in 1 .. array_length(v_stage_names, 1) loop
    insert into public.process_stages (process_id, name, display_order) values (v_process_id, v_stage_names[v_i], v_i - 1);
  end loop;
  insert into public.services (workspace_id, service_category_id, name, slug, process_id, is_bookable, is_portal_visible, requires_organizer, requires_engagement_letter, requires_documents, requires_signature, requires_review, requires_invoice, requires_payment_before_release, status)
  values (v_workspace_id, v_tax_prep_category_id, 'Extensions', 'extensions', v_process_id, false, true, false, false, false, false, false, true, false, 'published');

  -- Consulting & Advisory: new service + pipeline
  insert into public.processes (workspace_id, name, slug, status, created_by)
  values (v_workspace_id, 'Consulting & Advisory Pipeline', 'consulting-advisory-pipeline', 'published', null)
  returning id into v_process_id;
  v_stage_names := array['Discovery', 'Scope Defined', 'Engagement Letter Signed', 'Session(s) Held', 'Recommendations Delivered', 'Follow-up', 'Closed'];
  for v_i in 1 .. array_length(v_stage_names, 1) loop
    insert into public.process_stages (process_id, name, display_order) values (v_process_id, v_stage_names[v_i], v_i - 1);
  end loop;
  insert into public.services (workspace_id, service_category_id, name, slug, process_id, is_bookable, is_portal_visible, requires_organizer, requires_engagement_letter, requires_documents, requires_signature, requires_review, requires_invoice, requires_payment_before_release, status)
  values (v_workspace_id, v_consulting_category_id, 'Consulting & Advisory', 'consulting-advisory', v_process_id, false, true, false, false, false, false, false, true, false, 'published');
end $$;
