-- Seeds 2 demo clients + engagements + tax-return detail into the PTIN
-- demo workspace (Summit) so the ERO demo's Tax Office rollup
-- (get_ero_return_status/get_ero_irs_notices/get_ero_extensions/
-- get_ero_tax_year_metrics) has real cross-account data to show tomorrow,
-- now that Demo - ERO Office <-> Summit is an active connection. Bypasses
-- create_client/create_engagement's has_permission() checks (which need a
-- real auth.uid() session) since this is a one-time admin seed, not a
-- user-driven action -- inserts match exactly what those RPCs would
-- produce otherwise.
do $$
declare
  v_ws uuid := 'b41f7ee8-e811-4d4d-8156-5ebf43014462'; -- Summit (PTIN demo)
  v_owner uuid := '94161e3f-ce7e-4626-8d0d-abef5350cf7c'; -- K. McCullens, owns both demo workspaces
  v_svc_individual uuid := 'dea347e1-f37e-496c-9ad8-1a7a3760e88d'; -- Individual Tax Prep
  v_svc_corporate uuid := 'f2f06154-99d6-40d6-9553-1fd4ff70bff8'; -- Corporate Tax Preparation
  v_client_a uuid;
  v_client_b uuid;
  v_eng_a uuid;
  v_eng_b uuid;
begin
  insert into public.clients (workspace_id, client_type, lifecycle_status, first_name, last_name, primary_email, primary_phone, created_by)
  values (v_ws, 'individual', 'active', 'Marcus', 'Webb', 'marcus.webb@example.com', '5551234567', v_owner)
  returning id into v_client_a;

  insert into public.clients (workspace_id, client_type, lifecycle_status, business_name, primary_email, primary_phone, created_by)
  values (v_ws, 'business', 'active', 'Bright Horizon Consulting LLC', 'accounts@example.com', '5559876543', v_owner)
  returning id into v_client_b;

  insert into public.engagements (client_id, workspace_id, service_id, engagement_number, status, open_date, due_date, assigned_staff_id)
  values (v_client_a, v_ws, v_svc_individual, 'ENG-2026-001', 'Completed', '2026-02-10', '2026-04-15', v_owner)
  returning id into v_eng_a;

  insert into public.engagements (client_id, workspace_id, service_id, engagement_number, status, open_date, due_date, assigned_staff_id)
  values (v_client_b, v_ws, v_svc_corporate, 'ENG-2026-002', 'Ready To Release', '2026-03-01', '2026-10-15', v_owner)
  returning id into v_eng_b;

  insert into public.engagement_tax_details (engagement_id, workspace_id, tax_year, return_type, return_status, is_extended, federal_refund_amount)
  values (v_eng_a, v_ws, 2026, '1040', 'filed', false, 1450.00);

  insert into public.engagement_tax_details (engagement_id, workspace_id, tax_year, return_type, return_status, is_extended, extension_filed_date, extension_due_date, federal_balance_due)
  values (v_eng_b, v_ws, 2026, '1120', 'ready_to_file', true, '2026-04-15', '2026-10-15', 3200.00);

  insert into public.irs_notices (workspace_id, entity_type, entity_id, notice_type, notice_date, response_due_date, status, description, created_by)
  values (v_ws, 'engagement', v_eng_b, 'CP2000', '2026-08-15', '2026-09-15', 'open', 'Proposed changes to income reported on the 2026 return -- documentation requested.', v_owner);
end $$;
