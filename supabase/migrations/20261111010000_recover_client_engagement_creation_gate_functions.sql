-- Migration-history recovery: the five client/engagement creation RPCs
-- gated by can_operate_client_book() (see the previous migration for why).
-- execute_automation_step, the sixth, is recovered separately further
-- below alongside its own additional idempotency/chain-depth prerequisites.
-- Bodies captured via pg_get_functiondef against production during this
-- reconciliation -- each already carries whatever other fixes main or a
-- prior session applied independently of this gate, so this is a verbatim
-- recovery, not a reimplementation.

CREATE OR REPLACE FUNCTION public.create_client(p_workspace_id uuid, p_client_type text, p_first_name text DEFAULT NULL::text, p_last_name text DEFAULT NULL::text, p_business_name text DEFAULT NULL::text, p_date_of_birth date DEFAULT NULL::date, p_primary_email text DEFAULT NULL::text, p_primary_phone text DEFAULT NULL::text, p_ssn text DEFAULT NULL::text, p_ein text DEFAULT NULL::text, p_itin text DEFAULT NULL::text, p_force_create boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_normalized_email citext;
  v_normalized_phone text;
  v_ssn_hash text;
  v_ein_hash text;
  v_existing record;
  v_new_id uuid;
begin
  if not public.has_permission(p_workspace_id, 'clients.create') then
    raise exception 'insufficient permissions to create a client in this workspace';
  end if;
  if not public.is_workspace_operational(p_workspace_id) then
    raise exception 'this workspace is not currently operational';
  end if;
  if not public.can_operate_client_book(p_workspace_id) then
    raise exception 'this workspace is not enabled to operate a client/engagement book';
  end if;

  if p_client_type not in ('individual', 'business', 'trust', 'estate', 'organization') then
    raise exception 'Unrecognized client type: %', p_client_type;
  end if;

  v_normalized_email := nullif(lower(btrim(p_primary_email)), '');
  v_normalized_phone := nullif(regexp_replace(coalesce(p_primary_phone, ''), '\D', '', 'g'), '');
  v_ssn_hash := case when p_ssn is not null and btrim(p_ssn) <> ''
    then encode(digest(regexp_replace(p_ssn, '\D', '', 'g') || p_workspace_id::text, 'sha256'), 'hex') end;
  v_ein_hash := case when p_ein is not null and btrim(p_ein) <> ''
    then encode(digest(regexp_replace(p_ein, '\D', '', 'g') || p_workspace_id::text, 'sha256'), 'hex') end;

  if not p_force_create then
    select id, array_remove(array[
        case when v_ssn_hash is not null and ssn_hash = v_ssn_hash then 'ssn' end,
        case when v_ein_hash is not null and ein_hash = v_ein_hash then 'ein' end,
        case when v_normalized_email is not null and normalized_email = v_normalized_email then 'email' end,
        case when v_normalized_phone is not null and normalized_phone = v_normalized_phone then 'phone' end
      ], null) as matched_on
    into v_existing
    from public.clients
    where workspace_id = p_workspace_id
      and merged_into_client_id is null
      and (
        (v_ssn_hash is not null and ssn_hash = v_ssn_hash)
        or (v_ein_hash is not null and ein_hash = v_ein_hash)
        or (v_normalized_email is not null and normalized_email = v_normalized_email)
        or (v_normalized_phone is not null and normalized_phone = v_normalized_phone)
      )
    limit 1;

    if v_existing.id is not null then
      return jsonb_build_object('client_id', v_existing.id, 'is_new', false, 'duplicate_matched_on', to_jsonb(v_existing.matched_on));
    end if;
  end if;

  insert into public.clients (
    workspace_id, client_type, first_name, last_name, business_name, date_of_birth,
    primary_email, primary_phone, normalized_email, normalized_phone,
    ssn_encrypted, ssn_last4, ssn_hash, ein_encrypted, ein_last4, ein_hash,
    itin_encrypted, itin_last4, itin_hash, created_by
  ) values (
    p_workspace_id, p_client_type, p_first_name, p_last_name, p_business_name, p_date_of_birth,
    p_primary_email, p_primary_phone, v_normalized_email, v_normalized_phone,
    public.encrypt_client_secret(p_ssn), nullif(right(regexp_replace(coalesce(p_ssn, ''), '\D', '', 'g'), 4), ''), v_ssn_hash,
    public.encrypt_client_secret(p_ein), nullif(right(regexp_replace(coalesce(p_ein, ''), '\D', '', 'g'), 4), ''), v_ein_hash,
    public.encrypt_client_secret(p_itin), nullif(right(regexp_replace(coalesce(p_itin, ''), '\D', '', 'g'), 4), ''),
    case when p_itin is not null and btrim(p_itin) <> '' then encode(digest(regexp_replace(p_itin, '\D', '', 'g') || p_workspace_id::text, 'sha256'), 'hex') end,
    auth.uid()
  )
  returning id into v_new_id;

  return jsonb_build_object('client_id', v_new_id, 'is_new', true, 'duplicate_matched_on', '[]'::jsonb);
end;
$function$;

CREATE OR REPLACE FUNCTION public.find_or_create_public_lead(p_workspace_id uuid, p_first_name text, p_last_name text, p_email text, p_phone text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_normalized_email citext;
  v_normalized_phone text;
  v_client_id uuid;
begin
  if not public.is_workspace_operational(p_workspace_id) then
    raise exception 'this workspace is not currently operational';
  end if;
  if not public.can_operate_client_book(p_workspace_id) then
    raise exception 'this workspace is not enabled to operate a client/engagement book';
  end if;

  v_normalized_email := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_normalized_phone := nullif(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), '');

  select id into v_client_id
  from public.clients
  where workspace_id = p_workspace_id
    and merged_into_client_id is null
    and (
      (v_normalized_email is not null and normalized_email = v_normalized_email)
      or (v_normalized_phone is not null and normalized_phone = v_normalized_phone)
    )
  limit 1;

  if v_client_id is not null then
    return v_client_id;
  end if;

  insert into public.clients (workspace_id, client_type, lifecycle_status, first_name, last_name, primary_email, primary_phone, normalized_email, normalized_phone)
  values (
    p_workspace_id, 'individual', 'lead',
    nullif(btrim(p_first_name), ''), nullif(btrim(p_last_name), ''),
    nullif(btrim(coalesce(p_email, '')), ''), nullif(btrim(coalesce(p_phone, '')), ''),
    v_normalized_email, v_normalized_phone
  )
  returning id into v_client_id;

  return v_client_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_engagement(p_workspace_id uuid, p_client_id uuid, p_service_id uuid DEFAULT NULL::uuid, p_assigned_staff_id uuid DEFAULT NULL::uuid, p_priority engagement_priority DEFAULT 'Medium'::engagement_priority, p_process_id uuid DEFAULT NULL::uuid, p_case_type text DEFAULT 'other'::text, p_due_date timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_service record;
  v_process record;
  v_engagement_id uuid;
  v_process_id uuid;
  v_handoff_run_id uuid;
begin
  if not has_permission(p_workspace_id, 'engagements.manage') then
    raise exception 'insufficient permissions to create an engagement in this workspace';
  end if;
  if not is_workspace_operational(p_workspace_id) then
    raise exception 'this workspace is not currently operational';
  end if;
  if not public.can_operate_client_book(p_workspace_id) then
    raise exception 'this workspace is not enabled to operate a client/engagement book';
  end if;
  if not exists (select 1 from clients where id = p_client_id and workspace_id = p_workspace_id) then
    raise exception 'client % not found or not accessible in this workspace', p_client_id;
  end if;

  if p_service_id is not null then
    select id, process_id into v_service from services
    where id = p_service_id and (workspace_id is null or workspace_id = p_workspace_id);
    if v_service.id is null then raise exception 'service % not found or not accessible in this workspace', p_service_id; end if;
  end if;

  if p_process_id is not null then
    select id into v_process from processes where id = p_process_id and (workspace_id is null or workspace_id = p_workspace_id);
    if v_process.id is null then raise exception 'pipeline % not found or not accessible in this workspace', p_process_id; end if;
    v_process_id := p_process_id;
  elsif p_service_id is not null then
    v_process_id := v_service.process_id;
  else
    v_process_id := null;
  end if;

  insert into engagements (workspace_id, client_id, service_id, workflow_id, assigned_staff_id, priority, case_type, due_date)
  values (p_workspace_id, p_client_id, p_service_id, v_process_id, p_assigned_staff_id, p_priority, coalesce(p_case_type, 'other'), p_due_date)
  returning id into v_engagement_id;

  if v_process_id is not null then
    update pipeline_runs
    set entity_type = 'engagement', entity_id = v_engagement_id
    where entity_type = 'client' and entity_id = p_client_id
      and process_id = v_process_id and status = 'Active'
    returning id into v_handoff_run_id;

    if v_handoff_run_id is not null then
      update pipeline_stages set entity_type = 'engagement' where pipeline_run_id = v_handoff_run_id;
    else
      perform start_pipeline_run('engagement', v_engagement_id, v_process_id);
    end if;
  end if;

  return v_engagement_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.accept_quote(p_quote_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_quote public.quotes;
  v_service record;
  v_category_slug text;
  v_case_type text;
  v_engagement_id uuid;
  v_invoice_id uuid;
begin
  select * into v_quote from public.quotes where id = p_quote_id;
  if v_quote.id is null then
    raise exception 'quote not found';
  end if;
  if not public.is_portal_user(v_quote.client_id) then
    raise exception 'not authorized to respond to this quote';
  end if;
  if not public.is_workspace_operational(v_quote.workspace_id) then
    raise exception 'this workspace is not currently operational';
  end if;
  if v_quote.status <> 'sent' then
    raise exception 'this quote is no longer awaiting a response';
  end if;

  update public.quotes set status = 'accepted', accepted_at = now() where id = p_quote_id;

  v_engagement_id := v_quote.engagement_id;

  if v_engagement_id is null and v_quote.service_id is not null then
    select id, process_id into v_service
    from public.services
    where id = v_quote.service_id and (workspace_id is null or workspace_id = v_quote.workspace_id);

    if v_service.id is not null then
      select sc.slug into v_category_slug
      from public.services s
      join public.service_categories sc on sc.id = s.service_category_id
      where s.id = v_service.id;

      v_case_type := case v_category_slug
        when 'tax-preparation' then 'tax_return'
        when 'bookkeeping' then 'bookkeeping'
        when 'payroll' then 'payroll'
        when 'business-services' then 'business_service'
        else 'other'
      end;

      if not public.can_operate_client_book(v_quote.workspace_id) then
        raise exception 'this workspace is not enabled to operate a client/engagement book';
      end if;

      insert into public.engagements (workspace_id, client_id, service_id, workflow_id, case_type)
      values (v_quote.workspace_id, v_quote.client_id, v_service.id, v_service.process_id, v_case_type)
      returning id into v_engagement_id;

      if v_service.process_id is not null then
        perform public.start_pipeline_run('engagement', v_engagement_id, v_service.process_id);
      end if;

      update public.quotes set engagement_id = v_engagement_id where id = p_quote_id;
    end if;
  end if;

  insert into public.invoices (workspace_id, client_id, engagement_id, status, line_items, subtotal, discount_amount, tax_amount, total_amount, notes)
  values (v_quote.workspace_id, v_quote.client_id, v_engagement_id, 'sent', v_quote.line_items, v_quote.subtotal, v_quote.discount_amount, v_quote.tax_amount, v_quote.total_amount, v_quote.notes)
  returning id into v_invoice_id;

  update public.quotes set invoice_id = v_invoice_id where id = p_quote_id;

  perform public._notify_admins_of_quote_response(v_quote.workspace_id, v_quote.client_id, p_quote_id, 'accepted');
end;
$function$;

CREATE OR REPLACE FUNCTION public.copy_shared_engagement(p_engagement_share_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_share public.engagement_shares;
  v_client_id uuid;
  v_new_client_id uuid := gen_random_uuid();
  v_new_engagement_id uuid := gen_random_uuid();
  v_row jsonb;
  v_tax_rec record;
  v_response_rec record;
  v_answer_rec record;
  v_attachment_rec record;
  v_new_response_id uuid;
  v_new_entity_id uuid;
  v_new_attachment_id uuid;
  v_new_storage_path text;
  v_paths jsonb := '[]'::jsonb;
begin
  select * into v_share from public.engagement_shares where id = p_engagement_share_id;
  if v_share.id is null then
    raise exception 'engagement share not found';
  end if;
  if not public.has_permission(v_share.shared_with_workspace_id, 'engagements.approve_review') then
    raise exception 'insufficient permissions to finalize this engagement share';
  end if;
  if not public.is_workspace_operational(v_share.shared_with_workspace_id) then
    raise exception 'this workspace is not currently operational';
  end if;
  if v_share.status <> 'approved' then
    raise exception 'this share has not been approved';
  end if;
  if not public.can_operate_client_book(v_share.shared_with_workspace_id) then
    raise exception 'this workspace is not enabled to operate a client/engagement book';
  end if;

  select client_id into v_client_id from public.engagements where id = v_share.engagement_id;

  select to_jsonb(t) into v_row from public.clients t where t.id = v_client_id;
  v_row := (v_row - 'merged_into_client_id' - 'relationship_manager_id' - 'default_reviewer_id' - 'default_compliance_officer_id')
    || jsonb_build_object(
      'id', v_new_client_id, 'workspace_id', v_share.shared_with_workspace_id,
      'source_workspace_id', v_share.workspace_id, 'created_at', now(), 'updated_at', now()
    );
  insert into public.clients (
    id, workspace_id, client_type, lifecycle_status, first_name, last_name, business_name, date_of_birth,
    primary_email, primary_phone, address_line1, address_line2, city, state, postal_code, country,
    ssn_encrypted, ssn_last4, ssn_hash, ein_encrypted, ein_last4, ein_hash, itin_encrypted, itin_last4, itin_hash,
    normalized_email, normalized_phone, has_portal_access, tags, custom_fields, notes, merged_into_client_id,
    created_by, created_at, updated_at, relationship_manager_id, default_reviewer_id, default_compliance_officer_id,
    client_number, source_workspace_id, portal_basic_info_completed_at, middle_name, suffix, lost_reason,
    sms_opt_out, sms_opt_out_at, email_opt_out, email_opt_out_at, lost_at
  )
  select
    id, workspace_id, client_type, lifecycle_status, first_name, last_name, business_name, date_of_birth,
    primary_email, primary_phone, address_line1, address_line2, city, state, postal_code, country,
    ssn_encrypted, ssn_last4, ssn_hash, ein_encrypted, ein_last4, ein_hash, itin_encrypted, itin_last4, itin_hash,
    normalized_email, normalized_phone, has_portal_access, tags, custom_fields, notes, merged_into_client_id,
    created_by, created_at, updated_at, relationship_manager_id, default_reviewer_id, default_compliance_officer_id,
    client_number, source_workspace_id, portal_basic_info_completed_at, middle_name, suffix, lost_reason,
    sms_opt_out, sms_opt_out_at, email_opt_out, email_opt_out_at, lost_at
  from jsonb_populate_record(null::public.clients, v_row);

  select to_jsonb(t) into v_row from public.engagements t where t.id = v_share.engagement_id;
  v_row := (v_row - 'reviewer_id' - 'assigned_staff_id' - 'compliance_officer_id')
    || jsonb_build_object(
      'id', v_new_engagement_id, 'workspace_id', v_share.shared_with_workspace_id,
      'client_id', v_new_client_id, 'status', 'Waiting On Review',
      'source_engagement_share_id', p_engagement_share_id, 'created_at', now(), 'updated_at', now()
    );
  insert into public.engagements (
    id, created_at, client_id, workspace_id, workflow_id, current_stage, priority, review_status,
    assigned_staff_id, reviewer_id, compliance_officer_id, owner_workspace_id, shared_status, open_date,
    due_date, completed_date, archived_date, internal_reference, engagement_number, service_id, updated_at,
    status, source_engagement_share_id, case_type, is_bank_product
  )
  select
    id, created_at, client_id, workspace_id, workflow_id, current_stage, priority, review_status,
    assigned_staff_id, reviewer_id, compliance_officer_id, owner_workspace_id, shared_status, open_date,
    due_date, completed_date, archived_date, internal_reference, engagement_number, service_id, updated_at,
    status, source_engagement_share_id, case_type, is_bank_product
  from jsonb_populate_record(null::public.engagements, v_row);

  for v_tax_rec in select * from public.engagement_tax_details where engagement_id = v_share.engagement_id loop
    v_row := (to_jsonb(v_tax_rec) - 'original_engagement_id')
      || jsonb_build_object(
        'engagement_id', v_new_engagement_id, 'workspace_id', v_share.shared_with_workspace_id,
        'created_at', now(), 'updated_at', now()
      );
    insert into public.engagement_tax_details select * from jsonb_populate_record(null::public.engagement_tax_details, v_row);
  end loop;

  for v_response_rec in select * from public.organizer_responses where engagement_id = v_share.engagement_id loop
    v_new_response_id := gen_random_uuid();
    v_row := (to_jsonb(v_response_rec) - 'resolved_service_id')
      || jsonb_build_object(
        'id', v_new_response_id, 'engagement_id', v_new_engagement_id, 'client_id', v_new_client_id,
        'workspace_id', v_share.shared_with_workspace_id, 'created_at', now(), 'updated_at', now()
      );
    insert into public.organizer_responses select * from jsonb_populate_record(null::public.organizer_responses, v_row);

    for v_answer_rec in select * from public.organizer_response_answers where organizer_response_id = v_response_rec.id loop
      v_row := to_jsonb(v_answer_rec)
        || jsonb_build_object('id', gen_random_uuid(), 'organizer_response_id', v_new_response_id, 'updated_at', now());
      insert into public.organizer_response_answers select * from jsonb_populate_record(null::public.organizer_response_answers, v_row);
    end loop;
  end loop;

  for v_attachment_rec in
    select * from public.attachments
    where visibility = 'client_visible' and is_archived = false
      and (
        (entity_type = 'engagement' and entity_id = v_share.engagement_id)
        or (entity_type = 'client' and entity_id = v_client_id)
      )
  loop
    v_new_attachment_id := gen_random_uuid();
    v_new_entity_id := case when v_attachment_rec.entity_type = 'engagement' then v_new_engagement_id else v_new_client_id end;
    v_new_storage_path := v_share.shared_with_workspace_id || '/' || v_new_entity_id || '/' || extract(epoch from now())::bigint || '-' || v_attachment_rec.file_name;

    v_row := (to_jsonb(v_attachment_rec) - 'replaces_attachment_id')
      || jsonb_build_object(
        'id', v_new_attachment_id, 'workspace_id', v_share.shared_with_workspace_id,
        'entity_id', v_new_entity_id, 'storage_path', v_new_storage_path, 'created_at', now()
      );
    insert into public.attachments (
      id, entity_id, workspace_id, file_name, storage_path, file_size_bytes, mime_type, uploaded_by,
      created_at, entity_type, category, tags, version, folder_id, is_favorite, is_archived, visibility,
      replaces_attachment_id, is_latest_version, is_locked, ai_metadata
    )
    select
      id, entity_id, workspace_id, file_name, storage_path, file_size_bytes, mime_type, uploaded_by,
      created_at, entity_type, category, tags, version, folder_id, is_favorite, is_archived, visibility,
      replaces_attachment_id, is_latest_version, is_locked, ai_metadata
    from jsonb_populate_record(null::public.attachments, v_row);

    v_paths := v_paths || jsonb_build_object('old_path', v_attachment_rec.storage_path, 'new_path', v_new_storage_path);
  end loop;

  return v_paths;
end;
$function$;
