-- run_critical_path_smoke_tests() picked its test workspace with no
-- ORDER BY and no guarantee it actually has a client:
--   select w.id, wu.user_id into v_workspace_id, v_owner_id
--   from workspaces w join workspace_users wu on ... limit 1;
-- Several real owner-having workspaces (MKB, Your Solutions, the Terrelle
-- Bethel PTIN shell) have zero clients, so this could land on one of them
-- and fail billing_payment_plan_check/document_signing_check with "no
-- client available" -- not because those features are broken (verified by
-- hand: the payment-application trigger and the e-signature token flow
-- both work correctly against a workspace that has clients), but because
-- the fixture-selection query itself was never guaranteed to find one.
-- Also updates the document_signing_check's record_signature_by_token call
-- to pass a signature_image_path -- both a typed name and a drawn
-- signature have been required on every signing flow since
-- require_both_typed_and_drawn_signature (2026-08-17); this smoke test
-- was never updated to match and would have failed that check regardless
-- of client availability.
create or replace function public.run_critical_path_smoke_tests()
 returns TABLE(check_name text, passed boolean, error_detail text)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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
  -- Prefer a workspace that actually has a client to attach fixtures to;
  -- fall back to any owner-having workspace only if none do (in which case
  -- checks 2 and 3 below correctly report "no client available").
  select w.id, wu.user_id into v_workspace_id, v_owner_id
  from workspaces w
  join workspace_users wu on wu.workspace_id = w.id and wu.is_owner = true
  where exists (select 1 from clients c where c.workspace_id = w.id)
  order by w.created_at
  limit 1;

  if v_workspace_id is null then
    select w.id, wu.user_id into v_workspace_id, v_owner_id
    from workspaces w join workspace_users wu on wu.workspace_id = w.id and wu.is_owner = true
    order by w.created_at
    limit 1;
  end if;

  if v_workspace_id is null then
    check_name := 'fixtures'; passed := false; error_detail := 'no workspace with an owner found to run tests against';
    return next;
    return;
  end if;

  select id into v_client_id from clients where workspace_id = v_workspace_id order by created_at limit 1;
  select id into v_other_client_id from clients where workspace_id = v_workspace_id and id <> v_client_id order by created_at limit 1;

  -- 1. Auth/permissions: workspace owner has_permission on a representative key.
  -- Note: SECURITY DEFINER functions can't SET/RESET ROLE, so this only
  -- swaps request.jwt.claims (what auth.uid() reads) -- sufficient since
  -- has_permission/is_portal_user compute from auth.uid(), not from the
  -- calling Postgres role.
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_owner_id)::text, true);
    select has_permission(v_workspace_id, 'documents.view') into v_has_perm;
    perform set_config('request.jwt.claims', '', true);
    if v_has_perm is not true then
      raise exception 'owner should have documents.view permission';
    end if;
    check_name := 'auth_permission_check'; passed := true; error_detail := null;
  exception when others then
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
  -- record_signature_by_token requires both a typed name and a drawn
  -- signature image path on every call (see
  -- require_both_typed_and_drawn_signature) -- the image path itself
  -- doesn't need to point at a real stored file for this check, since the
  -- function only validates that it's non-blank before recording the
  -- signature.
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

    perform record_signature_by_token(v_token, 'typed', 'Smoke Tester', v_workspace_id || '/smoke-cpt-signature.png');

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

        if not is_portal_user(v_client_id) then
          raise exception 'portal user should see their own client';
        end if;
        if v_other_client_id is not null and is_portal_user(v_other_client_id) then
          raise exception 'portal user incorrectly sees an unrelated client';
        end if;

        perform set_config('request.jwt.claims', '', true);
        check_name := 'portal_access_check'; passed := true; error_detail := null;
        return next;
      end if;
    end;
  exception when others then
    perform set_config('request.jwt.claims', '', true);
    check_name := 'portal_access_check'; passed := false; error_detail := sqlerrm;
    return next;
  end;
end;
$function$;

-- CREATE OR REPLACE resets the function's ACL to Postgres defaults (which
-- grants EXECUTE to authenticated/anon directly, not via PUBLIC) --
-- restoring it to service-role-only, matching how it was before this
-- migration and how the vitest suite (tests/critical-paths.test.ts) is
-- meant to call it: with the service-role key, not from the client app.
revoke all on function public.run_critical_path_smoke_tests() from public, anon, authenticated;
grant execute on function public.run_critical_path_smoke_tests() to service_role;
