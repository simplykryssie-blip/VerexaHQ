-- documents_storage_bucket_check was left stale by the earlier storage
-- bucket rename (20260721090000_close_public_execute_gaps_and_rename_
-- bucket.sql), which renamed storage.buckets 'firmflow-client-documents'
-- -> 'verexahq-client-documents' and updated documents.storage_bucket's
-- column DEFAULT to match, but never touched this CHECK constraint --
-- so it still required the literal value 'firmflow-client-documents', a
-- bucket id that no longer exists anywhere in storage.buckets (confirmed
-- live: the only client-documents bucket is 'verexahq-client-documents').
--
-- Confirmed live via a rolled-back reproduction that this silently broke
-- every insert into `documents` relying on the column default -- not
-- just the new universal-template activation flow
-- (apply_service_template_to_client), but also request_client_document(),
-- the RPC behind RequestDocumentModal's "Request a Document" button. It
-- had never been caught before because `documents` had zero live rows.
-- Both RPCs were reproduced hitting the identical error:
--   new row for relation "documents" violates check constraint
--   "documents_storage_bucket_check"
-- with the rejected value being 'verexahq-client-documents' (the correct,
-- currently-approved bucket -- the constraint was wrong, not the insert).
--
-- Fix: point the constraint at the one real, approved bucket instead of
-- loosening it -- it stays a single-literal CHECK, exactly as strict as
-- before, just correct instead of stale. This matches the column default
-- and the storage RLS policies (verexa_*_client_files, added in the same
-- rename migration) which already scope all client document access to
-- 'verexahq-client-documents' alone.
alter table public.documents drop constraint if exists documents_storage_bucket_check;
alter table public.documents add constraint documents_storage_bucket_check
  check (storage_bucket = 'verexahq-client-documents');

-- Defense in depth: both RPCs that create `documents` placeholder rows
-- (document_status = 'Requested', no storage_path, no uploaded_by --
-- confirmed live this is the only request-placeholder pattern in the
-- schema; no separate document_requests/client_document_requests table
-- exists, and engagement_requirements is an unrelated stage-gate
-- checklist keyed by pipeline_stage_id, not a document-request table)
-- now set storage_bucket explicitly instead of relying on the column
-- default, so a future default/constraint drift can't silently break
-- document-request creation again. Signature and every other line of
-- behavior are unchanged from the live function bodies read via
-- pg_get_functiondef before this migration was written.

create or replace function public.apply_service_template_to_client(p_client_id uuid, p_service_template_id uuid, p_start_date date DEFAULT CURRENT_DATE, p_due_date date DEFAULT NULL::date, p_assigned_to uuid DEFAULT NULL::uuid, p_price numeric DEFAULT NULL::numeric, p_service_year text DEFAULT NULL::text, p_billing_frequency text DEFAULT NULL::text, p_is_recurring boolean DEFAULT NULL::boolean)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  target_workspace_id uuid;
  template_record public.service_templates%rowtype;
  new_service_id uuid;
  new_engagement_id uuid;
  first_stage_id uuid;
  task_record record;
  doc_record record;
  form_record record;
  new_doc_id uuid;
  new_assignment_id uuid;
begin
  select workspace_id into target_workspace_id from public.clients where id = p_client_id;

  if target_workspace_id is null then
    raise exception 'Client not found.';
  end if;

  if not public.can_staff_write(target_workspace_id) then
    raise exception 'You do not have permission to apply service templates.';
  end if;

  if p_assigned_to is not null and not exists(
    select 1 from public.workspace_members
    where workspace_id = target_workspace_id and user_id = p_assigned_to and member_status = 'Active'
  ) then
    raise exception 'Assigned user is not an active workspace member';
  end if;

  select * into template_record
  from public.service_templates
  where id = p_service_template_id
    and is_active = true
    and (workspace_id = target_workspace_id or (workspace_id is null and is_platform_template = true));

  if template_record.id is null then
    raise exception 'Service template not found.';
  end if;

  if template_record.default_pipeline_id is not null then
    select ps.id into first_stage_id
    from public.pipeline_stages ps
    where ps.pipeline_id = template_record.default_pipeline_id
    order by ps.sort_order asc, ps.created_at asc
    limit 1;
  end if;

  insert into public.services (
    workspace_id,
    client_id,
    service_type,
    service_name,
    service_status,
    service_year,
    price,
    start_date,
    due_date,
    assigned_to,
    billing_frequency,
    is_recurring,
    pipeline_id,
    pipeline_stage_id
  ) values (
    target_workspace_id,
    p_client_id,
    template_record.service_type,
    template_record.template_name,
    'New',
    p_service_year,
    coalesce(p_price, template_record.default_price),
    p_start_date,
    p_due_date,
    p_assigned_to,
    p_billing_frequency,
    coalesce(p_is_recurring, false),
    template_record.default_pipeline_id,
    first_stage_id
  ) returning id into new_service_id;

  insert into public.engagements (
    workspace_id,
    account_id,
    service_id,
    engagement_name,
    engagement_type,
    tax_year,
    period_start,
    period_end,
    pipeline_id,
    pipeline_stage_id,
    status,
    assigned_to,
    due_date
  ) values (
    target_workspace_id,
    p_client_id,
    new_service_id,
    template_record.template_name,
    template_record.service_type,
    nullif(p_service_year, '')::int,
    p_start_date,
    p_due_date,
    template_record.default_pipeline_id,
    first_stage_id,
    'active',
    p_assigned_to,
    p_due_date
  ) returning id into new_engagement_id;

  for task_record in
    select * from public.service_template_tasks
    where service_template_id = p_service_template_id
    order by sort_order asc, created_at asc
  loop
    insert into public.tasks (
      workspace_id,
      client_id,
      service_id,
      engagement_id,
      task_title,
      task_description,
      priority,
      task_status,
      assigned_to,
      due_date
    ) values (
      target_workspace_id,
      p_client_id,
      new_service_id,
      new_engagement_id,
      task_record.task_title,
      task_record.task_description,
      task_record.priority,
      'To Do',
      p_assigned_to,
      case when task_record.due_offset_days is null then null else p_start_date + task_record.due_offset_days end
    );
  end loop;

  for doc_record in
    select * from public.service_template_documents
    where service_template_id = p_service_template_id
    order by sort_order asc, created_at asc
  loop
    insert into public.documents (
      workspace_id,
      client_id,
      service_id,
      engagement_id,
      document_name,
      document_category,
      document_status,
      storage_bucket,
      requested_by,
      client_message,
      is_visible_to_client
    ) values (
      target_workspace_id,
      p_client_id,
      new_service_id,
      new_engagement_id,
      doc_record.document_name,
      doc_record.document_category,
      'Requested',
      'verexahq-client-documents',
      auth.uid(),
      doc_record.client_message,
      true
    ) returning id into new_doc_id;

    insert into public.client_checklist_items (
      workspace_id,
      client_id,
      service_id,
      engagement_id,
      item_type,
      item_title,
      item_description,
      item_status,
      visible_to_client,
      sort_order
    ) values (
      target_workspace_id,
      p_client_id,
      new_service_id,
      new_engagement_id,
      'Document',
      doc_record.document_name,
      doc_record.client_message,
      'Not Started',
      true,
      doc_record.sort_order
    );
  end loop;

  for form_record in
    select * from public.service_template_forms
    where service_template_id = p_service_template_id
    order by sort_order asc, created_at asc
  loop
    insert into public.client_form_assignments (
      workspace_id,
      client_id,
      service_id,
      engagement_id,
      template_id,
      assignment_status,
      due_date,
      client_message,
      assigned_by
    ) values (
      target_workspace_id,
      p_client_id,
      new_service_id,
      new_engagement_id,
      form_record.form_template_id,
      'Sent',
      case when form_record.due_offset_days is null then null else p_start_date + form_record.due_offset_days end,
      form_record.client_message,
      auth.uid()
    ) returning id into new_assignment_id;

    insert into public.client_checklist_items (
      workspace_id,
      client_id,
      service_id,
      engagement_id,
      item_type,
      item_title,
      item_description,
      item_status,
      due_date,
      visible_to_client,
      sort_order
    )
    select
      target_workspace_id,
      p_client_id,
      new_service_id,
      new_engagement_id,
      'Form',
      ft.template_name,
      form_record.client_message,
      'Not Started',
      case when form_record.due_offset_days is null then null else p_start_date + form_record.due_offset_days end,
      true,
      form_record.sort_order
    from public.form_templates ft
    where ft.id = form_record.form_template_id;
  end loop;

  return new_service_id;
end;
$function$;

create or replace function public.request_client_document(p_client_id uuid, p_document_name text, p_document_category text DEFAULT NULL::text, p_service_id uuid DEFAULT NULL::uuid, p_client_message text DEFAULT NULL::text)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_workspace_id uuid; v_document_id uuid; v_name text:=trim(coalesce(p_document_name,''));
begin
 select workspace_id into v_workspace_id from public.clients where id=p_client_id;
 if v_workspace_id is null then raise exception 'Client not found'; end if;
 if not public.can_staff_write(v_workspace_id) and not public.is_platform_admin() then raise exception 'Document request permission required'; end if;
 if length(v_name) not between 1 and 200 then raise exception 'Valid document name is required'; end if;
 if p_document_category is not null and length(trim(p_document_category))>100 then raise exception 'Document category is too long'; end if;
 if p_client_message is not null and length(p_client_message)>2000 then raise exception 'Client message is too long'; end if;
 if p_service_id is not null and not exists(select 1 from public.services where id=p_service_id and client_id=p_client_id and workspace_id=v_workspace_id) then raise exception 'Service does not belong to this client'; end if;
 insert into public.documents(workspace_id,client_id,service_id,document_name,document_category,document_status,storage_bucket,requested_date,requested_by,client_message,is_visible_to_client)
 values(v_workspace_id,p_client_id,p_service_id,v_name,nullif(trim(coalesce(p_document_category,'')),''),'Requested','verexahq-client-documents',current_date,auth.uid(),nullif(trim(coalesce(p_client_message,'')),''),true)
 returning id into v_document_id;
 insert into public.client_portal_todos(workspace_id,client_id,related_table,related_id,todo_type,title,description,client_visible)
 values(v_workspace_id,p_client_id,'documents',v_document_id,'document_request','Upload: '||v_name,nullif(trim(coalesce(p_client_message,'')),''),true);
 perform public.create_workspace_audit_event(v_workspace_id,'document_requested','documents',v_document_id,'Document requested','A document was requested from the client.',p_client_id,null,null,null,null,null,jsonb_build_object('service_id',p_service_id,'source','request_client_document'));
 return v_document_id;
end $function$;
