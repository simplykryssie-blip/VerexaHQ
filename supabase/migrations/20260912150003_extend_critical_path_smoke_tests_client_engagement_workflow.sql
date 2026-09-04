-- Extends run_critical_path_smoke_tests() with checks for client creation,
-- engagement creation, and workflow (automation) triggers, alongside the
-- existing auth/billing/document-signing/portal-access checks. Each new
-- check follows the same self-contained create -> verify -> clean-up
-- pattern as the existing ones.
create or replace function public.run_critical_path_smoke_tests()
returns table(check_name text, passed boolean, error_detail text)
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
  v_new_client_id uuid;
  v_new_engagement_id uuid;
  v_service_id uuid;
  v_wf_engagement_id uuid;
  v_automation_id uuid;
  v_run_id uuid;
  v_run_status text;
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

  -- 5. Client creation: create_client RPC actually inserts a row (subject to
  -- the clients.create permission check) and the client-number-generation
  -- trigger on `clients` runs.
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_owner_id)::text, true);
    select (public.create_client(v_workspace_id, 'individual', 'Smoke', 'CPT-Client-' || substr(gen_random_uuid()::text, 1, 8)) ->> 'client_id')::uuid into v_new_client_id;
    perform set_config('request.jwt.claims', '', true);

    if v_new_client_id is null then
      raise exception 'create_client did not return a client_id';
    end if;

    select client_number into v_result from clients where id = v_new_client_id;
    if v_result.client_number is null then
      raise exception 'trg_generate_client_number did not populate client_number';
    end if;

    delete from clients where id = v_new_client_id;
    check_name := 'client_creation_check'; passed := true; error_detail := null;
  exception when others then
    perform set_config('request.jwt.claims', '', true);
    check_name := 'client_creation_check'; passed := false; error_detail := sqlerrm;
    delete from clients where id = v_new_client_id;
  end;
  return next;

  -- 6. Engagement creation: create_engagement RPC actually inserts a row
  -- (subject to the engagements.manage permission check) and the
  -- engagement-number-generation trigger on `engagements` runs.
  begin
    if v_client_id is null then
      raise exception 'no client available to attach an engagement to';
    end if;

    perform set_config('request.jwt.claims', json_build_object('sub', v_owner_id)::text, true);
    select public.create_engagement(v_workspace_id, v_client_id) into v_new_engagement_id;
    perform set_config('request.jwt.claims', '', true);

    if v_new_engagement_id is null then
      raise exception 'create_engagement did not return an engagement_id';
    end if;

    select engagement_number into v_result from engagements where id = v_new_engagement_id;
    if v_result.engagement_number is null then
      raise exception 'trg_generate_engagement_number did not populate engagement_number';
    end if;

    delete from engagements where id = v_new_engagement_id;
    check_name := 'engagement_creation_check'; passed := true; error_detail := null;
  exception when others then
    perform set_config('request.jwt.claims', '', true);
    check_name := 'engagement_creation_check'; passed := false; error_detail := sqlerrm;
    delete from engagements where id = v_new_engagement_id;
  end;
  return next;

  -- 7. Workflow triggers: an engagement.created automation actually fires
  -- and records an automation_run when a matching engagement is created.
  -- trg_fire_engagement_created_automations is a deferred constraint
  -- trigger -- set it immediate so it fires before this function returns
  -- rather than at the end of the enclosing transaction.
  begin
    select id into v_service_id from services where workspace_id is null or workspace_id = v_workspace_id order by created_at limit 1;

    if v_service_id is null or v_client_id is null then
      check_name := 'workflow_trigger_check'; passed := true;
      error_detail := 'skipped -- no service available to exercise an engagement.created automation trigger';
    else
      insert into automations (workspace_id, name, slug, trigger_type, trigger_config, conditions, is_enabled, status, created_by)
      values (v_workspace_id, 'SMOKE-CPT automation', 'smoke-cpt-automation-' || substr(gen_random_uuid()::text, 1, 8), 'engagement.created', jsonb_build_object('service_id', v_service_id), '[]'::jsonb, true, 'published', v_owner_id)
      returning id into v_automation_id;

      set constraints trg_fire_engagement_created_automations immediate;

      perform set_config('request.jwt.claims', json_build_object('sub', v_owner_id)::text, true);
      select public.create_engagement(v_workspace_id, v_client_id, v_service_id) into v_wf_engagement_id;
      perform set_config('request.jwt.claims', '', true);

      select id, status into v_run_id, v_run_status from automation_runs
        where automation_id = v_automation_id and engagement_id = v_wf_engagement_id
        order by started_at desc limit 1;

      if v_run_id is null then
        raise exception 'engagement.created trigger did not create an automation_run';
      end if;

      delete from automation_runs where automation_id = v_automation_id;
      delete from engagements where id = v_wf_engagement_id;
      delete from automations where id = v_automation_id;

      check_name := 'workflow_trigger_check'; passed := true; error_detail := null;
    end if;
  exception when others then
    perform set_config('request.jwt.claims', '', true);
    check_name := 'workflow_trigger_check'; passed := false; error_detail := sqlerrm;
    delete from automation_runs where automation_id = v_automation_id;
    delete from engagements where id = v_wf_engagement_id;
    delete from automations where id = v_automation_id;
  end;
  return next;
end;
$function$;
