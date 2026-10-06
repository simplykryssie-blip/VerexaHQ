create or replace function public.create_document_request(p_workspace_id uuid, p_entity_type text, p_entity_id uuid, p_template_id uuid, p_title text, p_due_date date DEFAULT NULL::date)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_request_id uuid;
begin
  if not public.has_permission(p_workspace_id, 'documents.request') then
    raise exception 'insufficient permissions to request documents in this workspace';
  end if;
  if not public.is_workspace_operational(p_workspace_id) then
    raise exception 'this workspace is not currently operational';
  end if;

  if p_entity_type = 'client' then
    if not exists (select 1 from public.clients where id = p_entity_id and workspace_id = p_workspace_id) then
      raise exception 'client % not found in this workspace', p_entity_id;
    end if;
  elsif p_entity_type = 'engagement' then
    if not exists (select 1 from public.engagements where id = p_entity_id and workspace_id = p_workspace_id) then
      raise exception 'engagement % not found in this workspace', p_entity_id;
    end if;
  elsif p_entity_type = 'firm_connection' then
    if not exists (select 1 from public.firm_connections where id = p_entity_id and parent_workspace_id = p_workspace_id) then
      raise exception 'firm connection % not found in this workspace', p_entity_id;
    end if;
  else
    raise exception 'unsupported entity_type: %', p_entity_type;
  end if;

  insert into public.document_requests (workspace_id, entity_type, entity_id, document_request_template_id, title, due_date, created_by)
  values (p_workspace_id, p_entity_type, p_entity_id, p_template_id, p_title, p_due_date, auth.uid())
  returning id into v_request_id;

  insert into public.document_request_item_statuses (document_request_id, document_request_item_id, name, is_required, category, status, fulfilled_by_attachment_id)
  select
    v_request_id,
    dri.id,
    dri.name,
    dri.is_required,
    nullif(dri.category, ''),
    coalesce(prior.status, 'pending'),
    prior.fulfilled_by_attachment_id
  from public.document_request_items dri
  left join lateral (
    select s.status, s.fulfilled_by_attachment_id
    from public.document_request_item_statuses s
    join public.document_requests r on r.id = s.document_request_id
    where r.entity_type = p_entity_type
      and r.entity_id = p_entity_id
      and s.name = dri.name
      and s.status <> 'pending'
    order by s.updated_at desc
    limit 1
  ) prior on true
  where dri.document_request_template_id = p_template_id;

  return v_request_id;
end;
$function$;

create or replace function public.create_engagement(p_workspace_id uuid, p_client_id uuid, p_service_id uuid DEFAULT NULL::uuid, p_assigned_staff_id uuid DEFAULT NULL::uuid, p_priority engagement_priority DEFAULT 'Medium'::engagement_priority, p_process_id uuid DEFAULT NULL::uuid, p_case_type text DEFAULT 'other'::text, p_due_date timestamp with time zone DEFAULT NULL::timestamp with time zone)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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

create or replace function public.share_engagement_with_ero(p_engagement_id uuid, p_workspace_id uuid, p_shared_with_workspace_id uuid, p_shared_items jsonb DEFAULT '{}'::jsonb, p_expires_in_days integer DEFAULT 30)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_id uuid;
begin
  if not public.is_workspace_member(p_workspace_id) then
    raise exception 'insufficient permissions to share an engagement from this workspace';
  end if;
  if not public.has_permission(p_workspace_id, 'engagements.share') then
    raise exception 'insufficient permissions to share engagements from this workspace';
  end if;
  if not public.is_workspace_operational(p_workspace_id) then
    raise exception 'this workspace is not currently operational';
  end if;
  if not exists (select 1 from public.engagements where id = p_engagement_id and workspace_id = p_workspace_id) then
    raise exception 'engagement % not found in this workspace', p_engagement_id;
  end if;
  if not exists (
    select 1 from public.firm_connections
    where relationship_type = 'ero_ptin' and status = 'active'
      and child_workspace_id = p_workspace_id and parent_workspace_id = p_shared_with_workspace_id
  ) then
    raise exception 'no active ERO connection to share this engagement with';
  end if;

  insert into public.engagement_shares (engagement_id, workspace_id, shared_with_workspace_id, shared_items, shared_by, expires_at)
  values (p_engagement_id, p_workspace_id, p_shared_with_workspace_id, coalesce(p_shared_items, '{}'::jsonb), auth.uid(), now() + make_interval(days => p_expires_in_days))
  returning id into v_id;

  return v_id;
end;
$function$;

create or replace function public.add_client_address(p_client_id uuid, p_workspace_id uuid, p_street text, p_city text, p_state text, p_zip text, p_make_primary boolean DEFAULT true, p_address_type text DEFAULT 'mailing'::text)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_id uuid;
  v_next_order integer;
begin
  if not has_permission(p_workspace_id, 'clients.edit') then
    raise exception 'insufficient permissions to edit this client';
  end if;
  if not public.is_workspace_operational(p_workspace_id) then
    raise exception 'this workspace is not currently operational';
  end if;
  if not exists (select 1 from public.clients where id = p_client_id and workspace_id = p_workspace_id) then
    raise exception 'client % not found in this workspace', p_client_id;
  end if;

  if p_make_primary then
    update public.client_addresses set is_primary = false where client_id = p_client_id and address_type = p_address_type and is_primary;
  end if;

  select coalesce(max(display_order), -1) + 1 into v_next_order
  from public.client_addresses where client_id = p_client_id and address_type = p_address_type;

  insert into public.client_addresses (client_id, workspace_id, address_type, street, city, state, zip, is_primary, display_order)
  values (p_client_id, p_workspace_id, p_address_type, p_street, p_city, p_state, p_zip, p_make_primary, v_next_order)
  returning id into v_id;

  return v_id;
end;
$function$;

create or replace function public.add_client_email(p_client_id uuid, p_workspace_id uuid, p_email text, p_make_primary boolean DEFAULT true, p_email_type text DEFAULT 'personal'::text)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_id uuid;
  v_next_order integer;
begin
  if not has_permission(p_workspace_id, 'clients.edit') then
    raise exception 'insufficient permissions to edit this client';
  end if;
  if not public.is_workspace_operational(p_workspace_id) then
    raise exception 'this workspace is not currently operational';
  end if;
  if not exists (select 1 from public.clients where id = p_client_id and workspace_id = p_workspace_id) then
    raise exception 'client % not found in this workspace', p_client_id;
  end if;

  if p_make_primary then
    update public.client_emails set is_primary = false where client_id = p_client_id and is_primary;
  end if;

  select coalesce(max(display_order), -1) + 1 into v_next_order from public.client_emails where client_id = p_client_id;

  insert into public.client_emails (client_id, workspace_id, email_type, email, is_primary, display_order)
  values (p_client_id, p_workspace_id, p_email_type, p_email, p_make_primary, v_next_order)
  returning id into v_id;

  return v_id;
end;
$function$;

create or replace function public.add_client_phone(p_client_id uuid, p_workspace_id uuid, p_phone text, p_make_primary boolean DEFAULT true, p_phone_type text DEFAULT 'mobile'::text)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_id uuid;
  v_next_order integer;
begin
  if not has_permission(p_workspace_id, 'clients.edit') then
    raise exception 'insufficient permissions to edit this client';
  end if;
  if not public.is_workspace_operational(p_workspace_id) then
    raise exception 'this workspace is not currently operational';
  end if;
  if not exists (select 1 from public.clients where id = p_client_id and workspace_id = p_workspace_id) then
    raise exception 'client % not found in this workspace', p_client_id;
  end if;

  if p_make_primary then
    update public.client_phones set is_primary = false where client_id = p_client_id and is_primary;
  end if;

  select coalesce(max(display_order), -1) + 1 into v_next_order from public.client_phones where client_id = p_client_id;

  insert into public.client_phones (client_id, workspace_id, phone_type, phone_number, is_primary, display_order)
  values (p_client_id, p_workspace_id, p_phone_type, p_phone, p_make_primary, v_next_order)
  returning id into v_id;

  return v_id;
end;
$function$;

create or replace function public.create_client_relationship(p_client_id uuid, p_workspace_id uuid, p_relationship_type text, p_related_name text, p_related_client_id uuid DEFAULT NULL::uuid, p_related_dob date DEFAULT NULL::date, p_related_ssn text DEFAULT NULL::text, p_custom_relationship_title text DEFAULT NULL::text)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $function$
declare
  v_id uuid;
begin
  if not public.has_permission(p_workspace_id, 'clients.edit') then
    raise exception 'insufficient permissions to add a relationship in this workspace';
  end if;
  if not public.is_workspace_operational(p_workspace_id) then
    raise exception 'this workspace is not currently operational';
  end if;
  if not exists (select 1 from public.clients where id = p_client_id and workspace_id = p_workspace_id) then
    raise exception 'client % not found in this workspace', p_client_id;
  end if;
  if p_related_client_id is not null and not exists (select 1 from public.clients where id = p_related_client_id and workspace_id = p_workspace_id) then
    raise exception 'related client % not found in this workspace', p_related_client_id;
  end if;

  insert into public.client_relationships (
    client_id, workspace_id, relationship_type, related_name, related_client_id,
    related_dob, related_ssn_encrypted, related_ssn_last4, custom_relationship_title
  ) values (
    p_client_id, p_workspace_id, p_relationship_type, p_related_name, p_related_client_id,
    p_related_dob, public.encrypt_client_secret(p_related_ssn),
    nullif(right(regexp_replace(coalesce(p_related_ssn, ''), '\D', '', 'g'), 4), ''),
    p_custom_relationship_title
  )
  returning id into v_id;

  return v_id;
end;
$function$;

create or replace function public.fulfill_document_request_item(p_item_status_id uuid, p_attachment_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_workspace_id uuid;
  v_entity_type text;
  v_entity_id uuid;
  v_folder_name text;
  v_folder_id uuid;
begin
  select r.workspace_id, r.entity_type, r.entity_id, dri.default_folder_name
  into v_workspace_id, v_entity_type, v_entity_id, v_folder_name
  from public.document_request_item_statuses s
  join public.document_requests r on r.id = s.document_request_id
  left join public.document_request_items dri on dri.id = s.document_request_item_id
  where s.id = p_item_status_id;

  if v_workspace_id is null then
    raise exception 'request item not found';
  end if;
  if not (
    public.has_permission(v_workspace_id, 'documents.upload')
    or public.is_portal_user_for_entity(v_entity_type, v_entity_id)
    or public.is_partner_workspace_for_firm_connection(v_workspace_id, v_entity_type, v_entity_id)
  ) then
    raise exception 'insufficient permissions';
  end if;
  if not public.is_workspace_operational(v_workspace_id) then
    raise exception 'this workspace is not currently operational';
  end if;
  if not exists (
    select 1 from public.attachments
    where id = p_attachment_id and workspace_id = v_workspace_id
      and entity_type = v_entity_type and entity_id = v_entity_id
  ) then
    raise exception 'attachment % does not belong to this document request''s entity', p_attachment_id;
  end if;

  update public.document_request_item_statuses
  set status = 'uploaded', fulfilled_by_attachment_id = p_attachment_id, updated_at = now()
  where id = p_item_status_id;

  if v_folder_name is not null then
    select id into v_folder_id
    from public.document_folders
    where entity_type = v_entity_type and entity_id = v_entity_id and name = v_folder_name
    limit 1;

    if v_folder_id is not null then
      update public.attachments set folder_id = v_folder_id where id = p_attachment_id;
    end if;
  end if;
end;
$function$;

create or replace function public.record_consent(p_consent_type text, p_version text, p_workspace_id uuid DEFAULT NULL::uuid, p_client_id uuid DEFAULT NULL::uuid, p_ip_address inet DEFAULT NULL::inet, p_user_agent text DEFAULT NULL::text)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_id uuid;
begin
  if p_client_id is not null then
    if p_workspace_id is null or not public.is_workspace_member(p_workspace_id) then
      raise exception 'insufficient permissions to record consent for this client';
    end if;
    if not exists (select 1 from public.clients where id = p_client_id and workspace_id = p_workspace_id) then
      raise exception 'client % not found in this workspace', p_client_id;
    end if;
  end if;

  insert into public.consent_records (workspace_id, user_id, client_id, consent_type, version, ip_address, user_agent)
  values (p_workspace_id, case when p_client_id is null then auth.uid() else null end, p_client_id, p_consent_type, p_version, p_ip_address, p_user_agent)
  returning id into v_id;

  return v_id;
end;
$function$;

create or replace function public.get_firm_production(p_connection_id uuid, p_period_start date DEFAULT NULL::date, p_period_end date DEFAULT NULL::date)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_conn record;
  v_start timestamptz;
  v_end timestamptz;
  v_result jsonb;
begin
  select * into v_conn from public.firm_connections where id = p_connection_id;
  if v_conn.id is null then
    raise exception 'connection not found';
  end if;
  if v_conn.status <> 'active' then
    raise exception 'firm connection is not active';
  end if;
  if not (public.is_workspace_member(v_conn.parent_workspace_id) or public.is_workspace_member(v_conn.child_workspace_id)) then
    raise exception 'insufficient permissions';
  end if;

  v_start := coalesce(p_period_start, date_trunc('month', now())::date);
  v_end := coalesce(p_period_end, now()::date) + interval '1 day';

  select jsonb_build_object(
    'period_start', v_start::date,
    'period_end', (v_end - interval '1 day')::date,
    'active_clients', (
      select count(*) from public.clients
      where workspace_id = v_conn.child_workspace_id and merged_into_client_id is null
    ),
    'engagements_by_status', (
      select coalesce(jsonb_object_agg(status, cnt), '{}'::jsonb)
      from (
        select status, count(*) cnt from public.engagements
        where workspace_id = v_conn.child_workspace_id and created_at >= v_start and created_at < v_end
        group by status
      ) s
    ),
    'returns_completed', (
      select count(*) from public.engagements
      where workspace_id = v_conn.child_workspace_id and status = 'Completed' and updated_at >= v_start and updated_at < v_end
    ),
    'gross_prep_fees', (
      select coalesce(sum(amount_paid), 0) from public.invoices
      where workspace_id = v_conn.child_workspace_id and status = 'paid' and created_at >= v_start and created_at < v_end
    ),
    'bank_products', (
      select coalesce(jsonb_agg(jsonb_build_object('product_type', product_type, 'bank_partner', bank_partner, 'count', cnt, 'total_rebate', total_rebate)), '[]'::jsonb)
      from (
        select product_type, bank_partner, count(*) cnt, coalesce(sum(rebate_amount), 0) total_rebate
        from public.bank_product_transactions
        where workspace_id = v_conn.child_workspace_id and status <> 'rejected' and created_at >= v_start and created_at < v_end
        group by product_type, bank_partner
      ) b
    ),
    'gross_bank_product_rebates', (
      select coalesce(sum(rebate_amount), 0) from public.bank_product_transactions
      where workspace_id = v_conn.child_workspace_id and status <> 'rejected' and created_at >= v_start and created_at < v_end
    ),
    'gross_bank_fees', (
      select coalesce(sum(bank_fee), 0) from public.bank_product_transactions
      where workspace_id = v_conn.child_workspace_id and status <> 'rejected' and created_at >= v_start and created_at < v_end
    ),
    'gross_addon_fees', (
      select coalesce(sum(addon_fee), 0) from public.bank_product_transactions
      where workspace_id = v_conn.child_workspace_id and status <> 'rejected' and created_at >= v_start and created_at < v_end
    ),
    'gross_transmission_fees', (
      select coalesce(sum(transmission_fee), 0) from public.bank_product_transactions
      where workspace_id = v_conn.child_workspace_id and status <> 'rejected' and created_at >= v_start and created_at < v_end
    ),
    'gross_paperwork_fees', (
      select coalesce(sum(paperwork_fee), 0) from public.bank_product_transactions
      where workspace_id = v_conn.child_workspace_id and status <> 'rejected' and created_at >= v_start and created_at < v_end
    )
  ) into v_result;

  return v_result;
end;
$function$;
