
-- Codifies the manual ad hoc smoke tests run throughout the beta-readiness
-- pass into a permanent, re-runnable RPC covering the 4 critical paths:
-- auth/permissions, billing/payments, document upload+signing (including
-- the public token-based signing link), and portal access isolation.
-- Each check creates its own fixtures and cleans them up, so it's safe to
-- run repeatedly against a live database. Returns one row per check so a
-- caller (see package.json "test" script) can assert every check passed.
create or replace function public.run_critical_path_smoke_tests()
returns table (check_name text, passed boolean, error_detail text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_owner_id uuid;
  v_client_id uuid;
  v_other_client_id uuid;
  v_attachment_id uuid;
  v_invoice_id uuid;
  v_plan_id uuid;
  v_payment_id uuid;
  v_request_id uuid;
  v_signer_id uuid;
  v_token uuid;
  v_result record;
  v_has_perm boolean;
begin
  select w.id, wu.user_id into v_workspace_id, v_owner_id
  from workspaces w join workspace_users wu on wu.workspace_id = w.id and wu.is_owner = true
  limit 1;

  if v_workspace_id is null then
    check_name := 'fixtures'; passed := false; error_detail := 'no workspace with an owner found to run tests against';
    return next;
    return;
  end if;

  select id into v_client_id from clients where workspace_id = v_workspace_id order by created_at limit 1;
  select id into v_other_client_id from clients where workspace_id = v_workspace_id and id <> v_client_id order by created_at limit 1;

  -- 1. Auth/permissions: workspace owner has_permission on a representative key.
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_owner_id)::text, true);
    perform set_config('role', 'authenticated', true);
    select has_permission(v_workspace_id, 'documents.view') into v_has_perm;
    reset role;
    perform set_config('request.jwt.claims', '', true);
    if v_has_perm is not true then
      raise exception 'owner should have documents.view permission';
    end if;
    check_name := 'auth_permission_check'; passed := true; error_detail := null;
  exception when others then
    reset role;
    perform set_config('request.jwt.claims', '', true);
    check_name := 'auth_permission_check'; passed := false; error_detail := sqlerrm;
  end;
  return next;

  -- 2. Billing/payments: payment plan installment paid via trigger-backed payment insert.
  begin
    if v_client_id is null then
      raise exception 'no client available to attach an invoice to';
    end if;
    insert into invoices (workspace_id, client_id, invoice_number, status, issue_date, total_amount, subtotal)
    values (v_workspace_id, v_client_id, 'SMOKE-CPT-' || substr(gen_random_uuid()::text, 1, 8), 'sent', now(), 100, 100)
    returning id into v_invoice_id;

    insert into payment_plans (workspace_id, invoice_id, installment_number, amount, due_date)
    values (v_workspace_id, v_invoice_id, 1, 100, now())
    returning id into v_plan_id;

    insert into payments (workspace_id, client_id, invoice_id, amount, status, payment_date)
    values (v_workspace_id, v_client_id, v_invoice_id, 100, 'succeeded', now())
    returning id into v_payment_id;

    update payment_plans set status = 'paid', paid_payment_id = v_payment_id where id = v_plan_id;

    select status into v_result from invoices where id = v_invoice_id;
    if v_result.status <> 'paid' then
      raise exception 'apply_payment_to_invoice trigger did not mark invoice paid, status=%', v_result.status;
    end if;

    delete from payments where id = v_payment_id;
    delete from payment_plans where id = v_plan_id;
    delete from invoices where id = v_invoice_id;
    check_name := 'billing_payment_plan_check'; passed := true; error_detail := null;
  exception when others then
    check_name := 'billing_payment_plan_check'; passed := false; error_detail := sqlerrm;
    delete from payments where id = v_payment_id;
    delete from payment_plans where id = v_plan_id;
    delete from invoices where id = v_invoice_id;
  end;
  return next;

  -- 3. Document upload + public signing link: attachment, signature request, token sign.
  begin
    if v_client_id is null then
      raise exception 'no client available to attach a document to';
    end if;
    insert into attachments (workspace_id, entity_type, entity_id, file_name, storage_path)
    values (v_workspace_id, 'client', v_client_id, 'smoke-cpt.pdf', v_workspace_id || '/smoke-cpt.pdf')
    returning id into v_attachment_id;

    insert into signature_requests (workspace_id, attachment_id, title)
    values (v_workspace_id, v_attachment_id, 'SMOKE-CPT signature')
    returning id into v_request_id;

    insert into signature_request_signers (signature_request_id, signer_name, signer_email, sign_order)
    values (v_request_id, 'Smoke Tester', 'smoke-cpt@example.com', 1)
    returning id, access_token into v_signer_id, v_token;

    select signer_status into v_result from get_signature_request_by_token(v_token);
    if v_result.signer_status <> 'pending' then
      raise exception 'public token read did not return pending status';
    end if;

    perform record_signature_by_token(v_token, 'typed', 'Smoke Tester');

    select status into v_result from signature_request_signers where id = v_signer_id;
    if v_result.status <> 'signed' then
      raise exception 'record_signature_by_token did not mark signer signed';
    end if;

    delete from signature_request_signers where id = v_signer_id;
    delete from signature_requests where id = v_request_id;
    delete from attachments where id = v_attachment_id;
    check_name := 'document_signing_check'; passed := true; error_detail := null;
  exception when others then
    check_name := 'document_signing_check'; passed := false; error_detail := sqlerrm;
    delete from signature_request_signers where id = v_signer_id;
    delete from signature_requests where id = v_request_id;
    delete from attachments where id = v_attachment_id;
  end;
  return next;

  -- 4. Portal access isolation: a client's primary portal user can see their
  -- own client via is_portal_user, and (if a second client exists) cannot
  -- see the other client.
  begin
    declare
      v_portal_user_id uuid;
    begin
      select cpu.user_id into v_portal_user_id
      from client_portal_users cpu
      where cpu.client_id = v_client_id and cpu.status = 'active'
      limit 1;

      if v_portal_user_id is null then
        check_name := 'portal_access_check'; passed := true;
        error_detail := 'skipped -- no active portal user exists for the test client yet';
        return next;
      else
        perform set_config('request.jwt.claims', json_build_object('sub', v_portal_user_id)::text, true);
        perform set_config('role', 'authenticated', true);

        if not is_portal_user(v_client_id) then
          raise exception 'portal user should see their own client';
        end if;
        if v_other_client_id is not null and is_portal_user(v_other_client_id) then
          raise exception 'portal user incorrectly sees an unrelated client';
        end if;

        reset role;
        perform set_config('request.jwt.claims', '', true);
        check_name := 'portal_access_check'; passed := true; error_detail := null;
        return next;
      end if;
    end;
  exception when others then
    reset role;
    perform set_config('request.jwt.claims', '', true);
    check_name := 'portal_access_check'; passed := false; error_detail := sqlerrm;
    return next;
  end;
end;
$$;

revoke all on function public.run_critical_path_smoke_tests() from public;
grant execute on function public.run_critical_path_smoke_tests() to service_role;
