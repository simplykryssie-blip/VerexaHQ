-- Phase 3.2: dual Service Bureau + ERO capability -- client/engagement
-- creation gate. Closes the gap found in the Phase 3.2 security-gate audit:
-- clients has no INSERT policy at all (RLS already denies direct PostgREST
-- inserts for every workspace, independent of this change), and neither
-- engagements_insert nor any of the six SECURITY DEFINER functions that
-- create clients/engagements ever checked workspace_type -- so a plain
-- service_bureau workspace could operate an ERO client/engagement book
-- through these RPCs with nothing to stop it (Doucet Financial Group did,
-- with 2,005 real client rows, before this migration).
--
-- INSERT-only by design: a service_bureau workspace with
-- ero_capability_enabled=false is blocked from CREATING new clients/
-- engagements, but every existing row it already has remains exactly as
-- readable and editable as before, under its normal clients.edit/
-- engagements.manage permissions -- clients_select/update/delete and
-- engagements_select/update/delete are untouched by this migration.
--
-- Exactly six functions receive the new check (the only six creation
-- paths for clients/engagements found in the audit):
--   create_client, create_engagement, find_or_create_public_lead,
--   accept_quote, copy_shared_engagement, execute_automation_step
-- Three more inherit the check transitively and are NOT modified here:
--   create_client_from_ghl_import        -> delegates to create_client
--   capture_public_lead_from_contact_step -> delegates to find_or_create_public_lead
--   capture_public_mkb_business_inquiry   -> delegates to find_or_create_public_lead
--
-- Every other workspace_type is unaffected: can_operate_client_book()
-- returns true unconditionally for any workspace_type <> 'service_bureau',
-- so ero_office, multi_office_firm, and independent_ptin behavior does not
-- change. A service_bureau with ero_capability_enabled=true behaves
-- exactly like it does today (all pre-existing permission checks still
-- apply, unchanged).

alter table public.workspaces
  add column ero_capability_enabled boolean not null default false;

comment on column public.workspaces.ero_capability_enabled is
  'Only meaningful when workspace_type = ''service_bureau''. When true, this '
  'Service Bureau workspace additionally operates its own ERO business in '
  'the SAME workspace: it may own clients/engagements, manage W-2 '
  'ptin_preparer staff, and hold ero_ptin child connections as parent. '
  'Never affects its pre-existing service_bureau_ero/service_bureau_ptin '
  'network, Packages, or Network Command Center, which are keyed on '
  'relationship_type, not this flag. No-op for every other workspace_type.';

create or replace function public.can_operate_client_book(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(
    (select w.workspace_type <> 'service_bureau' or w.ero_capability_enabled
     from public.workspaces w where w.id = p_workspace_id),
    false
  );
$$;

comment on function public.can_operate_client_book(uuid) is
  'True for every workspace_type except service_bureau, where it additionally '
  'requires ero_capability_enabled. Gates NEW client/engagement creation only '
  '-- never referenced by any SELECT/UPDATE/DELETE policy, so existing rows '
  'stay fully readable/editable under their normal permissions regardless of '
  'this flag.';

-- clients has no INSERT policy today (confirmed live) -- this adds the
-- first one, for defense-in-depth alongside the RPC-level checks below.
create policy clients_insert on public.clients
  for insert
  with check (
    has_permission(workspace_id, 'clients.create')
    and is_workspace_operational(workspace_id)
    and public.can_operate_client_book(workspace_id)
  );

-- engagements_insert already exists -- AND the new clause onto it via
-- ALTER POLICY, preserving every other property, matching this repo's own
-- convention (see 20261017000000_rls_suspension_enforcement_deletes_and_automation_steps.sql).
alter policy engagements_insert on public.engagements
  with check (
    has_permission(workspace_id, 'engagements.manage')
    and is_workspace_operational(workspace_id)
    and public.can_operate_client_book(workspace_id)
  );

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
  insert into public.clients select * from jsonb_populate_record(null::public.clients, v_row);

  select to_jsonb(t) into v_row from public.engagements t where t.id = v_share.engagement_id;
  v_row := (v_row - 'reviewer_id' - 'assigned_staff_id' - 'compliance_officer_id')
    || jsonb_build_object(
      'id', v_new_engagement_id, 'workspace_id', v_share.shared_with_workspace_id,
      'client_id', v_new_client_id, 'status', 'Waiting On Review',
      'source_engagement_share_id', p_engagement_share_id, 'created_at', now(), 'updated_at', now()
    );
  insert into public.engagements select * from jsonb_populate_record(null::public.engagements, v_row);

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
    insert into public.attachments select * from jsonb_populate_record(null::public.attachments, v_row);

    v_paths := v_paths || jsonb_build_object('old_path', v_attachment_rec.storage_path, 'new_path', v_new_storage_path);
  end loop;

  return v_paths;
end;
$function$;

CREATE OR REPLACE FUNCTION public.execute_automation_step(p_run_id uuid, p_step_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_run record;
  v_step record;
  v_eng record;
  v_workspace record;
  v_branding record;
  v_context jsonb;
  v_status text := 'completed';
  v_error text;
  v_skip_note text;
  v_response record;
  v_service record;
  v_new_engagement_id uuid;
  v_doc_request_id uuid;
  v_doc_request_entity_type text;
  v_doc_request_entity_id uuid;
  v_target_stage_id uuid;
  v_target_order int;
  v_current_order int;
  v_loop_guard int;
  v_thread_id uuid;
  v_new_client_id uuid;
  v_normalized_email text;
  v_normalized_phone text;
  v_quote_id uuid;
  v_child_run_id uuid;
  v_portal_user_id uuid;
  v_channels text[];
  v_recipient record;
  v_organizer_link text;
  v_base_url text;
  v_resolved_organizer_template_id uuid;
  v_assign_target text;
  v_assignment_mode text;
  v_resolved_staff_id uuid;
  v_appointment_start timestamptz;
  v_appointment_end timestamptz;
  v_dnd_channel text;
  v_resolved_service_id uuid;
  v_target_process_id uuid;
  v_link_template_id_raw text;
  v_pipeline_entity_type text;
  v_pipeline_entity_id uuid;
  v_pipeline_run_id uuid;
  v_pipeline_stage_id uuid;
  v_rendered_message text;
  v_close_stage_id uuid;
  v_step_tags text[];
  v_tag text;
  v_signature_attachment_id uuid;
  v_signature_title text;
  v_signature_recipient_email text;
  v_signature_recipient_name text;
  v_signature_request_id uuid;
  v_signature_access_token uuid;
  v_new_task_id uuid;
  v_dedupe_key text;
  v_new_message_id uuid;
  v_connection_id uuid;
  v_partner_prospect_id uuid;
  v_partner_email text;
  v_partner_phone text;
begin
  select * into v_run from public.automation_runs where id = p_run_id;
  select * into v_step from public.automation_steps where id = p_step_id;

  if v_run.status <> 'running' then
    return;
  end if;

  if not public.is_workspace_operational(v_run.workspace_id) then
    if v_run.blocked_at is null then
      insert into public.automation_execution_logs (workspace_id, automation_id, engagement_id, workflow_run_id, status, execution_data, error_message, executed_at)
      values (
        v_run.workspace_id, v_run.automation_id, v_run.engagement_id, p_run_id, 'blocked',
        jsonb_build_object('run_id', p_run_id, 'step_id', p_step_id),
        'This workspace is not currently operational -- the run is paused and will resume automatically once the workspace becomes active again.',
        now()
      );
    end if;
    update public.automation_runs set blocked_at = coalesce(blocked_at, now()), blocked_step_id = p_step_id where id = p_run_id;
    return;
  end if;

  if v_run.blocked_at is not null then
    update public.automation_runs set blocked_at = null, blocked_step_id = null where id = p_run_id;
  end if;

  v_connection_id := v_run.connection_id;
  v_partner_prospect_id := v_run.partner_prospect_id;

  if v_run.engagement_id is not null then
    select e.engagement_number, e.status, e.priority, e.service_id, c.first_name, c.last_name, c.primary_email, c.primary_phone,
      c.sms_opt_out, c.email_opt_out, c.relationship_manager_id
    into v_eng
    from public.engagements e
    left join public.clients c on c.id = e.client_id
    where e.id = v_run.engagement_id;
  elsif v_run.client_id is not null then
    select null::text as engagement_number, null::text as status, null::text as priority, null::uuid as service_id,
      c.first_name, c.last_name, c.primary_email, c.primary_phone, c.sms_opt_out, c.email_opt_out, c.relationship_manager_id
    into v_eng
    from public.clients c
    where c.id = v_run.client_id;
  elsif v_partner_prospect_id is not null then
    select null::text as engagement_number, null::text as status, null::text as priority, null::uuid as service_id,
      p.first_name, p.last_name, p.email::text as primary_email, p.phone as primary_phone,
      null::boolean as sms_opt_out, null::boolean as email_opt_out, p.assigned_staff_id as relationship_manager_id
    into v_eng
    from public.partner_prospects p
    where p.id = v_partner_prospect_id;
  else
    select null::text as engagement_number, null::text as status, null::text as priority, null::uuid as service_id,
      null::text as first_name, null::text as last_name, null::text as primary_email, null::text as primary_phone,
      null::boolean as sms_opt_out, null::boolean as email_opt_out, null::uuid as relationship_manager_id
    into v_eng;
  end if;

  select name, timezone into v_workspace from public.workspaces where id = v_run.workspace_id;
  select support_phone, support_email, custom_domain into v_branding from public.branding where workspace_id = v_run.workspace_id;

  v_context := jsonb_build_object(
    'engagement_number', v_eng.engagement_number,
    'client_name', btrim(coalesce(v_eng.first_name, '') || ' ' || coalesce(v_eng.last_name, '')),
    'first_name', v_eng.first_name,
    'client_first_name', v_eng.first_name,
    'firm_name', v_workspace.name,
    'status', v_eng.status,
    'tax_year', (extract(year from now())::int - 1)::text,
    'office_phone', v_branding.support_phone,
    'office_email', v_branding.support_email,
    'portal_link', 'https://verexahq.com/portal/login'
  );

  begin
    if v_step.action_type = 'delay' then
      null;
    elsif v_step.action_type = 'business_hours_delay' then
      null;
    elsif v_step.action_type = 'condition' then
      null;
    elsif v_step.action_type = 'webhook' then
      if nullif(v_step.action_config->>'url', '') is null then
        raise exception 'No URL configured for this step';
      end if;
      if v_run.is_test then
        v_skip_note := 'test mode -- would call webhook ' || (v_step.action_config->>'url');
      else
        insert into public.automation_webhook_deliveries (workspace_id, run_id, url, payload)
        values (
          v_run.workspace_id, p_run_id, v_step.action_config->>'url',
          v_context || jsonb_build_object('trigger', v_run.trigger_snapshot)
        );
      end if;
    elsif v_step.action_type = 'send_email' then
      if v_run.client_id is null and v_run.engagement_id is null then
        if v_connection_id is not null then
          select w.primary_contact_email::text into v_partner_email
          from public.firm_connections fc
          join public.workspaces w on w.id = fc.child_workspace_id
          where fc.id = v_connection_id;

          if v_partner_email is null then
            raise exception 'Partner workspace has no primary contact email on file';
          end if;

          if v_run.is_test then
            v_skip_note := 'test mode -- would email ' || v_partner_email;
          else
            insert into public.notification_queue (workspace_id, recipient_email, channel, template_key, payload, entity_type, entity_id, event_type, dedupe_key)
            values (
              v_run.workspace_id, v_partner_email, 'Email', v_step.action_config->>'template_slug', v_context,
              'firm_connection', v_connection_id,
              'automation', 'automation_step:' || p_step_id || ':' || p_run_id
            )
            on conflict (workspace_id, template_key, dedupe_key) where dedupe_key is not null do nothing;
          end if;
        elsif v_partner_prospect_id is not null then
          v_partner_email := v_eng.primary_email;

          if v_partner_email is null then
            raise exception 'Partner prospect has no email on file';
          end if;

          if v_run.is_test then
            v_skip_note := 'test mode -- would email ' || v_partner_email;
          else
            insert into public.notification_queue (workspace_id, recipient_email, channel, template_key, payload, entity_type, entity_id, event_type, dedupe_key)
            values (
              v_run.workspace_id, v_partner_email, 'Email', v_step.action_config->>'template_slug', v_context,
              'partner_prospect', v_partner_prospect_id,
              'automation', 'automation_step:' || p_step_id || ':' || p_run_id
            )
            on conflict (workspace_id, template_key, dedupe_key) where dedupe_key is not null do nothing;
          end if;
        else
          raise exception 'This workflow run has no client, engagement, or connection to email';
        end if;
      else
        if v_eng.primary_email is null then
          raise exception 'Client has no email on file';
        end if;
        if v_run.is_test then
          v_skip_note := 'test mode -- would email ' || v_eng.primary_email;
        elsif v_eng.email_opt_out then
          v_skip_note := 'client has opted out of email';
        else
          v_link_template_id_raw := nullif(v_step.action_config->>'organizer_template_id', '');
          if v_link_template_id_raw is not null then
            v_resolved_organizer_template_id := case
              when v_link_template_id_raw = 'current_run' then nullif(v_run.trigger_snapshot->>'last_organizer_template_id', '')::uuid
              else v_link_template_id_raw::uuid
            end;
            v_base_url := 'https://' || coalesce(nullif(v_branding.custom_domain, ''), 'verexahq.com');
            select v_base_url || '/o/' || public_token::text into v_organizer_link
            from public.organizer_templates where id = v_resolved_organizer_template_id;
            v_context := v_context || jsonb_build_object('organizer_link', v_organizer_link);
          end if;
          insert into public.notification_queue (workspace_id, recipient_email, channel, template_key, payload, entity_type, entity_id, event_type, dedupe_key)
          values (
            v_run.workspace_id, v_eng.primary_email, 'Email', v_step.action_config->>'template_slug', v_context,
            case when v_run.engagement_id is not null then 'engagement' else 'client' end,
            coalesce(v_run.engagement_id, v_run.client_id),
            'automation', 'automation_step:' || p_step_id || ':' || p_run_id
          )
          on conflict (workspace_id, template_key, dedupe_key) where dedupe_key is not null do nothing;
        end if;
      end if;
    elsif v_step.action_type = 'send_sms' then
      if v_run.client_id is null and v_run.engagement_id is null then
        if v_connection_id is not null then
          select w.phone into v_partner_phone
          from public.firm_connections fc
          join public.workspaces w on w.id = fc.child_workspace_id
          where fc.id = v_connection_id;

          if v_partner_phone is null then
            raise exception 'Partner workspace has no phone number on file';
          end if;

          if v_run.is_test then
            v_skip_note := 'test mode -- would text ' || v_partner_phone;
          else
            insert into public.notification_queue (workspace_id, recipient_phone, channel, template_key, payload, entity_type, entity_id, event_type, dedupe_key)
            values (
              v_run.workspace_id, v_partner_phone, 'SMS', v_step.action_config->>'template_slug', v_context,
              'firm_connection', v_connection_id,
              'automation', 'automation_step:' || p_step_id || ':' || p_run_id
            )
            on conflict (workspace_id, template_key, dedupe_key) where dedupe_key is not null do nothing;
          end if;
        elsif v_partner_prospect_id is not null then
          v_partner_phone := v_eng.primary_phone;

          if v_partner_phone is null then
            raise exception 'Partner prospect has no phone number on file';
          end if;

          if v_run.is_test then
            v_skip_note := 'test mode -- would text ' || v_partner_phone;
          else
            insert into public.notification_queue (workspace_id, recipient_phone, channel, template_key, payload, entity_type, entity_id, event_type, dedupe_key)
            values (
              v_run.workspace_id, v_partner_phone, 'SMS', v_step.action_config->>'template_slug', v_context,
              'partner_prospect', v_partner_prospect_id,
              'automation', 'automation_step:' || p_step_id || ':' || p_run_id
            )
            on conflict (workspace_id, template_key, dedupe_key) where dedupe_key is not null do nothing;
          end if;
        else
          raise exception 'This workflow run has no client, engagement, or connection to text';
        end if;
      else
        if v_eng.primary_phone is null then
          raise exception 'Client has no phone on file';
        end if;
        if v_run.is_test then
          v_skip_note := 'test mode -- would text ' || v_eng.primary_phone;
        elsif v_eng.sms_opt_out then
          v_skip_note := 'client has opted out of sms';
        else
          v_link_template_id_raw := nullif(v_step.action_config->>'organizer_template_id', '');
          if v_link_template_id_raw is not null then
            v_resolved_organizer_template_id := case
              when v_link_template_id_raw = 'current_run' then nullif(v_run.trigger_snapshot->>'last_organizer_template_id', '')::uuid
              else v_link_template_id_raw::uuid
            end;
            v_base_url := 'https://' || coalesce(nullif(v_branding.custom_domain, ''), 'verexahq.com');
            select v_base_url || '/o/' || public_token::text into v_organizer_link
            from public.organizer_templates where id = v_resolved_organizer_template_id;
            v_context := v_context || jsonb_build_object('organizer_link', v_organizer_link);
          end if;
          insert into public.notification_queue (workspace_id, recipient_phone, channel, template_key, payload, entity_type, entity_id, event_type, dedupe_key)
          values (
            v_run.workspace_id, v_eng.primary_phone, 'SMS', v_step.action_config->>'template_slug', v_context,
            case when v_run.engagement_id is not null then 'engagement' else 'client' end,
            coalesce(v_run.engagement_id, v_run.client_id),
            'automation', 'automation_step:' || p_step_id || ':' || p_run_id
          )
          on conflict (workspace_id, template_key, dedupe_key) where dedupe_key is not null do nothing;
        end if;
      end if;
    elsif v_step.action_type = 'create_task' then
      if v_run.engagement_id is null and v_run.client_id is null and v_connection_id is null and v_partner_prospect_id is null then
        raise exception 'This workflow run has no engagement, client, connection, or partner prospect to attach a task to';
      end if;
      v_dedupe_key := 'automation_step:' || p_step_id || ':' || p_run_id;

      insert into public.tasks (workspace_id, engagement_id, client_id, firm_connection_id, partner_prospect_id, title, description, assigned_staff_id, due_date, priority, visibility, automation_dedupe_key)
      values (
        v_run.workspace_id, v_run.engagement_id,
        case when v_run.engagement_id is null then v_run.client_id else null end,
        case when v_run.engagement_id is null and v_run.client_id is null then v_connection_id else null end,
        case when v_run.engagement_id is null and v_run.client_id is null and v_connection_id is null then v_partner_prospect_id else null end,
        public.render_merge_fields(coalesce(v_step.action_config->>'title', 'Automated task'), v_context),
        public.render_merge_fields(v_step.action_config->>'description', v_context),
        case when v_step.action_config->>'assigned_staff_id' = 'client_relationship_manager' then v_eng.relationship_manager_id
             else nullif(v_step.action_config->>'assigned_staff_id', '')::uuid end,
        case when v_step.action_config ? 'due_in_days' then now() + make_interval(days => (v_step.action_config->>'due_in_days')::int) else null end,
        coalesce(v_step.action_config->>'priority', 'medium'),
        coalesce(nullif(v_step.action_config->>'visibility', ''), 'internal'),
        v_dedupe_key
      )
      on conflict (automation_dedupe_key) where automation_dedupe_key is not null do nothing
      returning id into v_new_task_id;

      if v_new_task_id is null then
        select id into v_new_task_id from public.tasks where automation_dedupe_key = v_dedupe_key;
      else
        if nullif(v_step.action_config->>'due_in_business_hours', '') is not null then
          update public.tasks
          set due_date = public.compute_business_hours_deadline(
            v_run.workspace_id,
            now(),
            (v_step.action_config->>'due_in_business_hours')::numeric
          )
          where id = v_new_task_id;
        end if;

        update public.automation_runs
        set trigger_snapshot = coalesce(trigger_snapshot, '{}'::jsonb)
          || jsonb_build_object(
               'created_tasks',
               coalesce(trigger_snapshot->'created_tasks', '{}'::jsonb) || jsonb_build_object(p_step_id::text, v_new_task_id)
             )
        where id = p_run_id;

        update public.automation_runs
        set trigger_snapshot = coalesce(trigger_snapshot, '{}'::jsonb)
          || jsonb_build_object('task_id', v_new_task_id)
        where id = p_run_id;
      end if;
    elsif v_step.action_type = 'create_appointment' then
      if v_run.engagement_id is null and v_run.client_id is null then
        raise exception 'This workflow run has no engagement or client to schedule an appointment for';
      end if;

      v_appointment_start := (
        (current_date + coalesce((v_step.action_config->>'days_from_now')::int, 1))
        + coalesce(nullif(v_step.action_config->>'time_of_day', '')::time, '10:00'::time)
      ) at time zone coalesce(nullif(v_workspace.timezone, ''), 'America/New_York');
      v_appointment_end := v_appointment_start + make_interval(mins => coalesce((v_step.action_config->>'duration_minutes')::int, 30));

      insert into public.appointments (workspace_id, client_id, engagement_id, staff_id, title, description, location, start_at, end_at, status, automation_dedupe_key)
      values (
        v_run.workspace_id, v_run.client_id, v_run.engagement_id,
        nullif(v_step.action_config->>'staff_id', '')::uuid,
        public.render_merge_fields(coalesce(v_step.action_config->>'title', 'Appointment'), v_context),
        nullif(public.render_merge_fields(v_step.action_config->>'description', v_context), ''),
        nullif(v_step.action_config->>'location', ''),
        v_appointment_start, v_appointment_end, 'scheduled',
        'automation_step:' || p_step_id || ':' || p_run_id
      )
      on conflict (automation_dedupe_key) where automation_dedupe_key is not null do nothing;
    elsif v_step.action_type = 'add_dnd' then
      if v_run.client_id is null then
        raise exception 'This workflow run has no client to opt out';
      end if;
      v_dnd_channel := coalesce(nullif(v_step.action_config->>'channel', ''), 'both');
      update public.clients
      set sms_opt_out = case when v_dnd_channel in ('sms', 'both') then true else sms_opt_out end,
          sms_opt_out_at = case when v_dnd_channel in ('sms', 'both') then now() else sms_opt_out_at end,
          email_opt_out = case when v_dnd_channel in ('email', 'both') then true else email_opt_out end,
          email_opt_out_at = case when v_dnd_channel in ('email', 'both') then now() else email_opt_out_at end
      where id = v_run.client_id;
    elsif v_step.action_type = 'remove_dnd' then
      if v_run.client_id is null then
        raise exception 'This workflow run has no client to opt back in';
      end if;
      v_dnd_channel := coalesce(nullif(v_step.action_config->>'channel', ''), 'both');
      update public.clients
      set sms_opt_out = case when v_dnd_channel in ('sms', 'both') then false else sms_opt_out end,
          sms_opt_out_at = case when v_dnd_channel in ('sms', 'both') then null else sms_opt_out_at end,
          email_opt_out = case when v_dnd_channel in ('email', 'both') then false else email_opt_out end,
          email_opt_out_at = case when v_dnd_channel in ('email', 'both') then null else email_opt_out_at end
      where id = v_run.client_id;
    elsif v_step.action_type = 'send_organizer_template' then
      if v_run.client_id is null then
        raise exception 'This workflow run has no client to send an organizer to';
      end if;

      v_resolved_service_id := coalesce(
        nullif(v_run.trigger_snapshot->>'service_id', '')::uuid,
        (
          select service_id
          from public.client_service_interests
          where client_id = v_run.client_id
          order by created_at desc
          limit 1
        )
      );

      v_resolved_organizer_template_id := coalesce(
        nullif(v_step.action_config->>'organizer_template_id', '')::uuid,
        (
          select ot.id
          from public.services s
          join public.organizer_templates svc_ot on svc_ot.id = s.organizer_template_id
          join public.organizer_templates ot
            on ot.slug = svc_ot.slug
            and ot.workspace_id = v_run.workspace_id
          where s.id = v_resolved_service_id
          limit 1
        )
      );

      if v_resolved_organizer_template_id is null then
        raise exception 'Could not determine which organizer to send -- no service on file for this client and no organizer template configured on this step';
      end if;

      if v_run.is_test then
        v_skip_note := 'test mode -- would send an organizer request to the client';
      else
        insert into public.organizer_responses (workspace_id, client_id, engagement_id, organizer_template_id)
        values (v_run.workspace_id, v_run.client_id, v_run.engagement_id, v_resolved_organizer_template_id);

        update public.automation_runs
        set trigger_snapshot = coalesce(trigger_snapshot, '{}'::jsonb) || jsonb_build_object('last_organizer_template_id', v_resolved_organizer_template_id)
        where id = p_run_id;
      end if;
    elsif v_step.action_type = 'create_engagement' then
      if v_run.client_id is null then
        raise exception 'This workflow run has no client to create an engagement for';
      end if;
      if v_run.trigger_snapshot->>'response_id' is null then
        raise exception 'This action only works on a run triggered by an organizer submission';
      end if;

      select id, resolved_service_id, needs_service_review into v_response
      from public.organizer_responses where id = (v_run.trigger_snapshot->>'response_id')::uuid;

      if v_response.id is null or v_response.needs_service_review or v_response.resolved_service_id is null then
        raise exception 'The organizer response needs a service manually resolved before an engagement can be created';
      end if;

      select id into v_service from public.services where id = v_response.resolved_service_id;

      if not public.can_operate_client_book(v_run.workspace_id) then
        raise exception 'this workspace is not enabled to operate a client/engagement book';
      end if;

      insert into public.engagements (workspace_id, client_id, service_id)
      values (v_run.workspace_id, v_run.client_id, v_service.id)
      returning id into v_new_engagement_id;
    elsif v_step.action_type = 'send_engagement_letter' then
      if v_run.engagement_id is null then
        raise exception 'This workflow run has no engagement to send an engagement letter for';
      end if;
      if v_run.client_id is null then
        raise exception 'This workflow run has no client to send an engagement letter to';
      end if;

      v_resolved_organizer_template_id := coalesce(
        nullif(v_step.action_config->>'engagement_letter_template_id', '')::uuid,
        (select engagement_letter_template_id from public.services where id = v_eng.service_id)
      );

      if v_resolved_organizer_template_id is null then
        raise exception 'No engagement letter template configured for this step or its service';
      end if;

      if v_run.is_test then
        v_skip_note := 'test mode -- would send an engagement letter for signature';
      else
        insert into public.pending_engagement_letter_sends (workspace_id, engagement_id, client_id, engagement_letter_template_id, additional_signer_relationship_type)
        values (v_run.workspace_id, v_run.engagement_id, v_run.client_id, v_resolved_organizer_template_id, nullif(v_step.action_config->>'additional_signer_relationship_type', ''));
      end if;
    elsif v_step.action_type = 'send_document_for_signature' then
      v_signature_attachment_id := nullif(v_step.action_config->>'attachment_id', '')::uuid;
      if v_signature_attachment_id is null then
        raise exception 'No document configured for this step';
      end if;
      v_signature_title := coalesce(nullif(public.render_merge_fields(v_step.action_config->>'title', v_context), ''), 'Please sign this document');
      v_signature_recipient_email := null;
      v_signature_recipient_name := null;

      if v_eng.primary_email is not null then
        v_signature_recipient_email := v_eng.primary_email;
        v_signature_recipient_name := btrim(coalesce(v_eng.first_name, '') || ' ' || coalesce(v_eng.last_name, ''));
      elsif v_connection_id is not null then
        select w.primary_contact_email, w.name into v_signature_recipient_email, v_signature_recipient_name
        from public.firm_connections fc
        join public.workspaces w on w.id = fc.child_workspace_id
        where fc.id = v_connection_id;
      end if;

      if v_signature_recipient_email is null then
        raise exception 'No recipient email could be resolved to send this document for signature';
      end if;

      if v_run.is_test then
        v_skip_note := 'test mode -- would send "' || v_signature_title || '" to ' || v_signature_recipient_email || ' for signature';
      else
        v_dedupe_key := 'automation_step:' || p_step_id || ':' || p_run_id;

        insert into public.signature_requests (workspace_id, attachment_id, title, automation_dedupe_key)
        values (v_run.workspace_id, v_signature_attachment_id, v_signature_title, v_dedupe_key)
        on conflict (automation_dedupe_key) where automation_dedupe_key is not null do nothing
        returning id into v_signature_request_id;

        if v_signature_request_id is null then
          select id into v_signature_request_id from public.signature_requests where automation_dedupe_key = v_dedupe_key;
        else
          insert into public.signature_request_signers (signature_request_id, signer_name, signer_email, sign_order)
          values (v_signature_request_id, coalesce(nullif(v_signature_recipient_name, ''), 'Recipient'), v_signature_recipient_email, 1)
          returning access_token into v_signature_access_token;

          v_base_url := 'https://' || coalesce(nullif(v_branding.custom_domain, ''), 'verexahq.com');

          insert into public.notification_queue (workspace_id, recipient_email, channel, template_key, payload, entity_type, entity_id, event_type, dedupe_key)
          values (
            v_run.workspace_id, v_signature_recipient_email, 'Email', 'document-signature-request',
            jsonb_build_object('title', v_signature_title, 'sign_link', v_base_url || '/sign/' || v_signature_access_token::text, 'firm_name', v_workspace.name),
            'document', v_signature_attachment_id,
            'automation', v_dedupe_key
          )
          on conflict (workspace_id, template_key, dedupe_key) where dedupe_key is not null do nothing;

          update public.automation_runs
          set trigger_snapshot = coalesce(trigger_snapshot, '{}'::jsonb)
            || jsonb_build_object(
                 'document_signatures',
                 coalesce(trigger_snapshot->'document_signatures', '{}'::jsonb) || jsonb_build_object(p_step_id::text, v_signature_request_id)
               )
          where id = p_run_id;
        end if;
      end if;
    elsif v_step.action_type = 'change_stage' then
      if v_run.engagement_id is not null then
        v_pipeline_entity_type := 'engagement';
        v_pipeline_entity_id := v_run.engagement_id;
      elsif v_run.client_id is not null then
        v_pipeline_entity_type := 'client';
        v_pipeline_entity_id := v_run.client_id;
      elsif v_partner_prospect_id is not null then
        v_skip_note := 'partner prospect has no pipeline stage to advance yet';
      else
        raise exception 'This workflow run has no engagement or client to advance';
      end if;

      if v_pipeline_entity_type is not null then
        select current_stage_id into v_pipeline_stage_id
        from public.pipeline_runs
        where entity_type = v_pipeline_entity_type and entity_id = v_pipeline_entity_id and status = 'Active'
        order by started_at desc limit 1;

        if v_pipeline_stage_id is null then
          raise exception 'This % has no active pipeline stage to advance', v_pipeline_entity_type;
        end if;

        update public.pipeline_stages set status = 'Completed', completed_at = now() where id = v_pipeline_stage_id;
      end if;
    elsif v_step.action_type = 'send_document_request' then
      if v_run.engagement_id is null and v_run.client_id is null and v_connection_id is null then
        raise exception 'This workflow run has no engagement, client, or connection to attach a document request to';
      end if;
      if nullif(v_step.action_config->>'document_request_template_id', '') is null then
        raise exception 'No document request template configured for this step';
      end if;

      if v_run.engagement_id is not null then
        v_doc_request_entity_type := 'engagement';
        v_doc_request_entity_id := v_run.engagement_id;
      elsif v_run.client_id is not null then
        v_doc_request_entity_type := 'client';
        v_doc_request_entity_id := v_run.client_id;
      else
        v_doc_request_entity_type := 'firm_connection';
        v_doc_request_entity_id := v_connection_id;
      end if;

      insert into public.document_requests (workspace_id, entity_type, entity_id, document_request_template_id, title, due_date)
      values (
        v_run.workspace_id, v_doc_request_entity_type, v_doc_request_entity_id,
        (v_step.action_config->>'document_request_template_id')::uuid,
        coalesce(public.render_merge_fields(v_step.action_config->>'title', v_context), 'Requested documents'),
        case when v_step.action_config ? 'due_in_days' then (now() + make_interval(days => (v_step.action_config->>'due_in_days')::int))::date else null end
      )
      returning id into v_doc_request_id;

      insert into public.document_request_item_statuses (document_request_id, document_request_item_id, name, is_required, category, status, fulfilled_by_attachment_id)
      select
        v_doc_request_id, dri.id, dri.name, dri.is_required, dri.category,
        coalesce(prior.status, 'pending'), prior.fulfilled_by_attachment_id
      from public.document_request_items dri
      left join lateral (
        select s.status, s.fulfilled_by_attachment_id
        from public.document_request_item_statuses s
        join public.document_requests r on r.id = s.document_request_id
        where r.entity_type = v_doc_request_entity_type and r.entity_id = v_doc_request_entity_id
          and s.name = dri.name and s.status <> 'pending'
        order by s.updated_at desc
        limit 1
      ) prior on true
      where dri.document_request_template_id = (v_step.action_config->>'document_request_template_id')::uuid;

      if v_doc_request_entity_type = 'firm_connection' and v_run.onboarding_id is not null then
        update public.partner_onboardings
        set document_request_id = v_doc_request_id
        where id = v_run.onboarding_id and document_request_id is null;
      end if;

    elsif v_step.action_type = 'assign_user' then
      v_assign_target := coalesce(v_step.action_config->>'target', case when v_run.engagement_id is not null then 'engagement' else 'client' end);
      v_assignment_mode := coalesce(v_step.action_config->>'assignment_mode', 'fixed');

      if v_assignment_mode = 'round_robin' then
        if v_assign_target = 'client' then
          select wu.user_id into v_resolved_staff_id
          from public.workspace_users wu
          where wu.workspace_id = v_run.workspace_id and wu.status = 'active'
            and (
              not (v_step.action_config ? 'staff_pool') or jsonb_array_length(v_step.action_config->'staff_pool') = 0
              or wu.user_id::text in (select jsonb_array_elements_text(v_step.action_config->'staff_pool'))
            )
          order by (
            select count(*) from public.clients c2
            where c2.relationship_manager_id = wu.user_id and c2.lifecycle_status not in ('archived', 'lost')
          ) asc, random()
          limit 1;
        else
          select wu.user_id into v_resolved_staff_id
          from public.workspace_users wu
          where wu.workspace_id = v_run.workspace_id and wu.status = 'active'
            and (
              not (v_step.action_config ? 'staff_pool') or jsonb_array_length(v_step.action_config->'staff_pool') = 0
              or wu.user_id::text in (select jsonb_array_elements_text(v_step.action_config->'staff_pool'))
            )
          order by (
            select count(*) from public.engagements e2
            where e2.assigned_staff_id = wu.user_id and e2.status not in ('Completed', 'Archived')
          ) asc, random()
          limit 1;
        end if;
        if v_resolved_staff_id is null then
          raise exception 'No eligible staff member found for round-robin assignment';
        end if;
      else
        v_resolved_staff_id := nullif(v_step.action_config->>'staff_id', '')::uuid;
        if v_resolved_staff_id is null then
          raise exception 'No staff member configured for this step';
        end if;
      end if;

      if v_assign_target = 'client' then
        if v_run.client_id is not null then
          update public.clients set relationship_manager_id = v_resolved_staff_id where id = v_run.client_id;
        elsif v_partner_prospect_id is not null then
          update public.partner_prospects set assigned_staff_id = v_resolved_staff_id where id = v_partner_prospect_id;
        elsif v_run.onboarding_id is not null then
          update public.partner_onboardings set assigned_staff_id = v_resolved_staff_id where id = v_run.onboarding_id;
        else
          raise exception 'This workflow run has no client, partner prospect, or partner onboarding to assign';
        end if;
      else
        if v_run.engagement_id is null then
          raise exception 'This workflow run has no engagement to assign';
        end if;
        update public.engagements set assigned_staff_id = v_resolved_staff_id where id = v_run.engagement_id;
      end if;

    elsif v_step.action_type = 'send_notification' then
      v_channels := coalesce(
        (select array_agg(value #>> '{}') from jsonb_array_elements(v_step.action_config->'channels')),
        array['In-App']
      );
      v_rendered_message := public.render_merge_fields(v_step.action_config->>'message', v_context);

      v_resolved_staff_id := coalesce(
        nullif(v_step.action_config->>'staff_id', '')::uuid,
        (select user_id from public.workspace_users where workspace_id = v_run.workspace_id and is_owner = true and status = 'active' limit 1)
      );

      select wu.user_id, u.email into v_recipient
      from public.workspace_users wu
      join auth.users u on u.id = wu.user_id
      where wu.workspace_id = v_run.workspace_id and wu.user_id = v_resolved_staff_id and wu.status = 'active';

      if v_recipient.user_id is not null then
        if 'In-App' = any(v_channels) then
          perform public.create_notification(
            v_run.workspace_id,
            v_recipient.user_id,
            'automation',
            coalesce(nullif(v_step.action_config->>'template_key', ''), 'automation-step'),
            v_context || jsonb_build_object('message', v_rendered_message),
            array['In-App'],
            coalesce(nullif(v_step.action_config->>'priority', ''), 'Medium'),
            case when v_run.engagement_id is not null then 'engagement' else 'client' end,
            coalesce(v_run.engagement_id, v_run.client_id)
          );
        end if;

        if 'Email' = any(v_channels) and v_recipient.email is not null then
          insert into public.notification_queue (workspace_id, recipient_user_id, recipient_email, channel, template_key, payload, priority, entity_type, entity_id)
          values (
            v_run.workspace_id, v_recipient.user_id, v_recipient.email, 'Email', 'automation-staff-notification',
            v_context || jsonb_build_object('message', v_rendered_message),
            coalesce(nullif(v_step.action_config->>'priority', ''), 'Medium'),
            case when v_run.engagement_id is not null then 'engagement' else 'client' end,
            coalesce(v_run.engagement_id, v_run.client_id)
          );
        end if;
      end if;

    elsif v_step.action_type = 'move_pipeline_stage' then
      if v_run.client_id is null and v_run.engagement_id is null and v_connection_id is null then
        if v_partner_prospect_id is not null then
          v_skip_note := 'partner prospect has no pipeline to move (pipeline stages are not yet supported for prospects)';
        else
          raise exception 'This workflow run has no client, engagement, or connection to move';
        end if;
      else
        if nullif(v_step.action_config->>'process_id', '') is null or nullif(v_step.action_config->>'process_stage_id', '') is null then
          raise exception 'No target pipeline stage configured for this step';
        end if;

        v_pipeline_entity_type := case when v_run.engagement_id is not null then 'engagement' when v_run.client_id is not null then 'client' else 'firm_connection' end;
        v_pipeline_entity_id := coalesce(v_run.engagement_id, v_run.client_id, v_connection_id);

        select id, current_stage_id into v_pipeline_run_id, v_pipeline_stage_id
        from public.pipeline_runs
        where entity_type = v_pipeline_entity_type and entity_id = v_pipeline_entity_id and status = 'Active'
          and process_id = (v_step.action_config->>'process_id')::uuid
        order by started_at desc limit 1;

        if v_pipeline_run_id is null then
          v_pipeline_run_id := public.start_pipeline_run(v_pipeline_entity_type, v_pipeline_entity_id, (v_step.action_config->>'process_id')::uuid);
          select current_stage_id into v_pipeline_stage_id from public.pipeline_runs where id = v_pipeline_run_id;
          if v_pipeline_entity_type = 'engagement' then
            update public.engagements set workflow_id = (v_step.action_config->>'process_id')::uuid where id = v_pipeline_entity_id;
          end if;
        end if;

        select id into v_target_stage_id from public.pipeline_stages
        where pipeline_run_id = v_pipeline_run_id and process_stage_id = (v_step.action_config->>'process_stage_id')::uuid;

        if v_target_stage_id is null then
          raise exception 'Target stage is not part of this pipeline';
        end if;

        select display_order into v_target_order from public.pipeline_stages where id = v_target_stage_id;
        select display_order into v_current_order from public.pipeline_stages where id = v_pipeline_stage_id;

        if v_target_order < v_current_order then
          raise exception 'Moving backward through pipeline stages is not supported by this action';
        end if;

        if v_pipeline_stage_id is distinct from v_target_stage_id then
          for v_close_stage_id in
            select id from public.pipeline_stages
            where pipeline_run_id = v_pipeline_run_id
              and display_order > v_current_order and display_order < v_target_order
              and status not in ('Completed', 'Skipped')
            order by display_order desc
          loop
            update public.pipeline_stages set status = 'Skipped', completed_at = now() where id = v_close_stage_id;
          end loop;

          update public.pipeline_stages set status = 'Completed', completed_at = now() where id = v_pipeline_stage_id;
        end if;

        if v_pipeline_entity_type = 'client' and not exists (
          select 1 from public.processes where id = (v_step.action_config->>'process_id')::uuid and is_lead_funnel
        ) then
          for v_close_stage_id in
            select ps.id
            from public.pipeline_stages ps
            join public.pipeline_runs pr on pr.id = ps.pipeline_run_id
            join public.processes proc on proc.id = pr.process_id
            where pr.entity_type = 'client' and pr.entity_id = v_pipeline_entity_id and pr.status = 'Active'
              and pr.id <> v_pipeline_run_id and proc.is_lead_funnel
              and ps.status not in ('Completed', 'Skipped')
            order by ps.display_order desc
          loop
            update public.pipeline_stages set status = 'Skipped', completed_at = now() where id = v_close_stage_id;
          end loop;
        end if;
      end if;

    elsif v_step.action_type = 'move_lead_to_service_pipeline' then
      if v_run.client_id is null then
        raise exception 'This workflow run has no client to move';
      end if;

      v_resolved_service_id := coalesce(
        nullif(v_run.trigger_snapshot->>'service_id', '')::uuid,
        (
          select service_id
          from public.client_service_interests
          where client_id = v_run.client_id
          order by created_at desc
          limit 1
        )
      );

      if v_resolved_service_id is null then
        raise exception 'This client has no service on file to resolve a pipeline from';
      end if;

      select process_id into v_target_process_id
      from public.services
      where id = v_resolved_service_id;

      if v_target_process_id is null then
        select sc.process_id
        into v_target_process_id
        from public.client_service_interests csi
        join public.service_categories sc on sc.id = csi.service_category_id
        where csi.client_id = v_run.client_id
          and csi.service_id = v_resolved_service_id
        order by csi.created_at desc
        limit 1;
      end if;

      if v_target_process_id is null then
        raise exception 'The selected service and its category have no pipeline configured';
      end if;

      select id into v_pipeline_run_id
      from public.pipeline_runs
      where entity_type = 'client' and entity_id = v_run.client_id and status = 'Active' and process_id = v_target_process_id
      order by started_at desc limit 1;

      if v_pipeline_run_id is null then
        perform public.start_pipeline_run('client', v_run.client_id, v_target_process_id);
      end if;

      if not exists (select 1 from public.processes where id = v_target_process_id and is_lead_funnel) then
        for v_close_stage_id in
          select ps.id
          from public.pipeline_stages ps
          join public.pipeline_runs pr on pr.id = ps.pipeline_run_id
          join public.processes proc on proc.id = pr.process_id
          where pr.entity_type = 'client' and pr.entity_id = v_run.client_id and pr.status = 'Active'
            and pr.process_id <> v_target_process_id and proc.is_lead_funnel
            and ps.status not in ('Completed', 'Skipped')
          order by ps.display_order desc
        loop
          update public.pipeline_stages set status = 'Skipped', completed_at = now() where id = v_close_stage_id;
        end loop;
      end if;

    elsif v_step.action_type = 'mark_lead_lost' then
      if v_run.client_id is null then
        raise exception 'This workflow run has no client to mark lost';
      end if;
      update public.clients set lifecycle_status = 'lost', lost_reason = v_step.action_config->>'reason', lost_at = now() where id = v_run.client_id;

    elsif v_step.action_type = 'convert_lead_to_client' then
      if v_run.client_id is null then
        raise exception 'This workflow run has no client to convert';
      end if;
      update public.clients set lifecycle_status = 'active' where id = v_run.client_id;

    elsif v_step.action_type = 'update_client' then
      if v_run.client_id is null then
        raise exception 'This workflow run has no client to update';
      end if;
      case v_step.action_config->>'field'
        when 'first_name' then
          update public.clients set first_name = v_step.action_config->>'value' where id = v_run.client_id;
        when 'middle_name' then
          update public.clients set middle_name = nullif(v_step.action_config->>'value', '') where id = v_run.client_id;
        when 'last_name' then
          update public.clients set last_name = v_step.action_config->>'value' where id = v_run.client_id;
        when 'suffix' then
          update public.clients set suffix = nullif(v_step.action_config->>'value', '') where id = v_run.client_id;
        when 'business_name' then
          update public.clients set business_name = nullif(v_step.action_config->>'value', '') where id = v_run.client_id;
        when 'client_type' then
          update public.clients set client_type = v_step.action_config->>'value' where id = v_run.client_id;
        when 'primary_email' then
          update public.clients
          set primary_email = v_step.action_config->>'value',
              normalized_email = nullif(lower(btrim(coalesce(v_step.action_config->>'value', ''))), '')
          where id = v_run.client_id;
        when 'primary_phone' then
          update public.clients
          set primary_phone = v_step.action_config->>'value',
              normalized_phone = nullif(regexp_replace(coalesce(v_step.action_config->>'value', ''), '\D', '', 'g'), '')
          where id = v_run.client_id;
        when 'address_line1' then
          update public.clients set address_line1 = nullif(v_step.action_config->>'value', '') where id = v_run.client_id;
        when 'address_line2' then
          update public.clients set address_line2 = nullif(v_step.action_config->>'value', '') where id = v_run.client_id;
        when 'city' then
          update public.clients set city = nullif(v_step.action_config->>'value', '') where id = v_run.client_id;
        when 'state' then
          update public.clients set state = nullif(v_step.action_config->>'value', '') where id = v_run.client_id;
        when 'postal_code' then
          update public.clients set postal_code = nullif(v_step.action_config->>'value', '') where id = v_run.client_id;
        when 'country' then
          update public.clients set country = nullif(v_step.action_config->>'value', '') where id = v_run.client_id;
        when 'relationship_manager_id' then
          update public.clients set relationship_manager_id = nullif(v_step.action_config->>'value', '')::uuid where id = v_run.client_id;
        else
          raise exception 'Unsupported field for update_client: %', v_step.action_config->>'field';
      end case;

    elsif v_step.action_type = 'create_client' then
      v_normalized_email := nullif(lower(btrim(v_step.action_config->>'primary_email')), '');
      v_normalized_phone := nullif(regexp_replace(coalesce(v_step.action_config->>'primary_phone', ''), '\D', '', 'g'), '');

      select id into v_new_client_id
      from public.clients
      where workspace_id = v_run.workspace_id
        and merged_into_client_id is null
        and (
          (v_normalized_email is not null and normalized_email = v_normalized_email)
          or (v_normalized_phone is not null and normalized_phone = v_normalized_phone)
        )
      limit 1;

      if v_new_client_id is null then
        if not public.can_operate_client_book(v_run.workspace_id) then
          raise exception 'this workspace is not enabled to operate a client/engagement book';
        end if;
        insert into public.clients (workspace_id, client_type, first_name, last_name, primary_email, primary_phone, normalized_email, normalized_phone, lifecycle_status)
        values (
          v_run.workspace_id,
          coalesce(nullif(v_step.action_config->>'client_type', ''), 'individual'),
          v_step.action_config->>'first_name',
          v_step.action_config->>'last_name',
          v_step.action_config->>'primary_email',
          v_step.action_config->>'primary_phone',
          v_normalized_email,
          v_normalized_phone,
          coalesce(nullif(v_step.action_config->>'lifecycle_status', ''), 'lead')
        )
        returning id into v_new_client_id;
      end if;

    elsif v_step.action_type = 'create_quote' then
      if v_run.client_id is null then
        raise exception 'This workflow run has no client to quote';
      end if;
      insert into public.quotes (workspace_id, client_id, engagement_id, service_id, title, subtotal, tax_amount, discount_amount, total_amount, valid_until, notes, automation_dedupe_key)
      values (
        v_run.workspace_id, v_run.client_id, v_run.engagement_id,
        nullif(v_step.action_config->>'service_id', '')::uuid,
        coalesce(public.render_merge_fields(v_step.action_config->>'title', v_context), 'Quote'),
        coalesce((v_step.action_config->>'subtotal')::numeric, 0),
        coalesce((v_step.action_config->>'tax_amount')::numeric, 0),
        coalesce((v_step.action_config->>'discount_amount')::numeric, 0),
        coalesce((v_step.action_config->>'total_amount')::numeric, coalesce((v_step.action_config->>'subtotal')::numeric, 0)),
        nullif(v_step.action_config->>'valid_until', '')::date,
        public.render_merge_fields(v_step.action_config->>'notes', v_context),
        'automation_step:' || p_step_id || ':' || p_run_id
      )
      on conflict (automation_dedupe_key) where automation_dedupe_key is not null do nothing;

    elsif v_step.action_type = 'send_quote' then
      select id into v_quote_id from public.quotes
      where workspace_id = v_run.workspace_id
        and client_id = v_run.client_id
        and status = 'draft'
      order by created_at desc
      limit 1;

      if v_quote_id is null then
        raise exception 'No draft quote found to send for this client';
      end if;

      if v_run.is_test then
        v_skip_note := 'test mode -- would send this quote to the client';
      else
        update public.quotes set status = 'sent' where id = v_quote_id;
      end if;

    elsif v_step.action_type = 'add_tag' then
      v_step_tags := coalesce(
        (select array_agg(value #>> '{}') from jsonb_array_elements(v_step.action_config->'tags')),
        case when nullif(v_step.action_config->>'tag', '') is not null then array[v_step.action_config->>'tag'] else null end
      );
      if v_step_tags is null or array_length(v_step_tags, 1) is null then
        raise exception 'No tag configured for this step';
      end if;
      if v_run.client_id is not null then
        update public.clients
        set tags = array(select distinct unnest(coalesce(tags, '{}') || v_step_tags))
        where id = v_run.client_id;
      elsif v_connection_id is not null then
        update public.firm_connections
        set tags = array(select distinct unnest(coalesce(tags, '{}') || v_step_tags))
        where id = v_connection_id;
      elsif v_partner_prospect_id is not null then
        update public.partner_prospects
        set tags = array(select distinct unnest(coalesce(tags, '{}') || v_step_tags))
        where id = v_partner_prospect_id;
      else
        raise exception 'This workflow run has no client, connection, or partner prospect to tag';
      end if;

    elsif v_step.action_type = 'remove_tag' then
      v_step_tags := coalesce(
        (select array_agg(value #>> '{}') from jsonb_array_elements(v_step.action_config->'tags')),
        case when nullif(v_step.action_config->>'tag', '') is not null then array[v_step.action_config->>'tag'] else null end
      );
      if v_step_tags is null or array_length(v_step_tags, 1) is null then
        raise exception 'No tag configured for this step';
      end if;
      if v_run.client_id is not null then
        foreach v_tag in array v_step_tags loop
          update public.clients set tags = array_remove(coalesce(tags, '{}'), v_tag) where id = v_run.client_id;
        end loop;
      elsif v_connection_id is not null then
        foreach v_tag in array v_step_tags loop
          update public.firm_connections set tags = array_remove(coalesce(tags, '{}'), v_tag) where id = v_connection_id;
        end loop;
      elsif v_partner_prospect_id is not null then
        foreach v_tag in array v_step_tags loop
          update public.partner_prospects set tags = array_remove(coalesce(tags, '{}'), v_tag) where id = v_partner_prospect_id;
        end loop;
      else
        raise exception 'This workflow run has no client, connection, or partner prospect to untag';
      end if;

    elsif v_step.action_type = 'add_note' then
      if v_run.engagement_id is null and v_run.client_id is null then
        raise exception 'This workflow run has no entity to attach a note to';
      end if;
      if nullif(v_step.action_config->>'body', '') is null then
        raise exception 'No note text configured for this step';
      end if;
      insert into public.notes (workspace_id, entity_type, entity_id, body, is_internal, automation_dedupe_key)
      values (
        v_run.workspace_id,
        case when v_run.engagement_id is not null then 'engagement' else 'client' end,
        coalesce(v_run.engagement_id, v_run.client_id),
        public.render_merge_fields(v_step.action_config->>'body', v_context),
        true,
        'automation_step:' || p_step_id || ':' || p_run_id
      )
      on conflict (automation_dedupe_key) where automation_dedupe_key is not null do nothing;

    elsif v_step.action_type = 'send_portal_message' then
      if v_run.client_id is null then
        raise exception 'This workflow run has no client to message';
      end if;
      if nullif(v_step.action_config->>'body', '') is null then
        raise exception 'No message body configured for this step';
      end if;

      if v_run.is_test then
        v_skip_note := 'test mode -- would send a portal message to the client';
      else
        select id into v_thread_id from public.message_threads
        where workspace_id = v_run.workspace_id and entity_type = 'client' and entity_id = v_run.client_id and status = 'open'
        order by coalesce(last_message_at, created_at) desc
        limit 1;

        if v_thread_id is null then
          insert into public.message_threads (workspace_id, entity_type, entity_id, subject, channel)
          values (v_run.workspace_id, 'client', v_run.client_id, coalesce(v_step.action_config->>'subject', 'Message from your accountant'), 'portal')
          returning id into v_thread_id;
        end if;

        insert into public.messages (workspace_id, thread_id, sender_type, is_internal, body, automation_dedupe_key)
        values (v_run.workspace_id, v_thread_id, 'staff', false, public.render_merge_fields(v_step.action_config->>'body', v_context), 'automation_step:' || p_step_id || ':' || p_run_id)
        on conflict (automation_dedupe_key) where automation_dedupe_key is not null do nothing
        returning id into v_new_message_id;

        if v_new_message_id is not null then
          update public.message_threads set last_message_at = now() where id = v_thread_id;
        end if;
      end if;

    elsif v_step.action_type = 'invite_to_portal' then
      if v_run.client_id is null then
        raise exception 'This workflow run has no client to invite';
      end if;

      if v_run.is_test then
        v_skip_note := 'test mode -- would invite the client to the portal';
      elsif not exists (select 1 from public.client_portal_users where client_id = v_run.client_id) then
        if v_eng.primary_email is null then
          raise exception 'Client has no email on file to invite';
        end if;

        insert into public.client_portal_users (client_id, workspace_id, invited_email, invited_name)
        values (v_run.client_id, v_run.workspace_id, v_eng.primary_email, btrim(coalesce(v_eng.first_name, '') || ' ' || coalesce(v_eng.last_name, '')))
        returning id into v_portal_user_id;

        insert into public.pending_portal_invites (workspace_id, client_id, client_portal_user_id)
        values (v_run.workspace_id, v_run.client_id, v_portal_user_id);
      end if;

    elsif v_step.action_type = 'start_workflow' then
      if nullif(v_step.action_config->>'automation_id', '') is null then
        raise exception 'No automation configured for this step';
      end if;
      if not exists (
        select 1 from public.automations
        where id = (v_step.action_config->>'automation_id')::uuid
          and workspace_id = v_run.workspace_id and is_enabled = true and status = 'published'
      ) then
        raise exception 'Target automation is not available to start';
      end if;

      if v_run.chain_depth >= 10 then
        raise exception 'This workflow chain is % steps deep, which exceeds the platform maximum of 10 -- this usually means two or more workflows are starting each other in a loop. Fix the chain instead of raising this limit.', v_run.chain_depth;
      end if;

      insert into public.automation_runs (workspace_id, automation_id, engagement_id, client_id, connection_id, onboarding_id, partner_prospect_id, trigger_snapshot, status, is_test, parent_run_id, chain_depth)
      values (v_run.workspace_id, (v_step.action_config->>'automation_id')::uuid, v_run.engagement_id, v_run.client_id, v_run.connection_id, v_run.onboarding_id, v_run.partner_prospect_id, v_run.trigger_snapshot, 'running', v_run.is_test, p_run_id, v_run.chain_depth + 1)
      returning id into v_child_run_id;
      perform public.start_next_automation_step(v_child_run_id);

    elsif v_step.action_type = 'end_workflow' then
      update public.automation_runs set status = 'completed', completed_at = now() where id = p_run_id;

    else
      raise exception 'Action type % is not yet supported', v_step.action_type;
    end if;
  exception when others then
    v_status := 'failed';
    v_error := sqlerrm;
  end;

  insert into public.automation_execution_logs (workspace_id, automation_id, engagement_id, workflow_run_id, status, execution_data, error_message, executed_at)
  values (
    v_run.workspace_id, v_run.automation_id, v_run.engagement_id, p_run_id, v_status,
    jsonb_build_object('step_id', p_step_id, 'action_type', v_step.action_type, 'run_id', p_run_id)
      || case when v_skip_note is not null then jsonb_build_object('skipped_reason', v_skip_note) else '{}'::jsonb end,
    v_error, now()
  );

  if v_status = 'failed' then
    update public.automation_runs set status = 'failed', completed_at = now() where id = p_run_id;
  else
    perform public.start_next_automation_step(p_run_id);
  end if;
end;
$function$;

-- Backfill: Doucet Financial Group is a real, non-demo service_bureau
-- workspace that already has 2,005 clients and pending ero_ptin invites --
-- it was already operating an ERO book before this gate existed. Every
-- other service_bureau workspace (only the 0-row demo shell exists
-- besides it today) remains at the default false unless explicitly
-- enabled later through the approved dual-capability flow.
update public.workspaces
set ero_capability_enabled = true
where id = '0867bbc5-e62b-4217-8bad-11351c24def5' -- Doucet Financial Group
  and workspace_type = 'service_bureau';
