-- Build 2 Part B service activation flow needs to let staff confirm owner,
-- price, service year, due date, billing frequency and recurring status
-- before activating a service — but apply_service_template_to_client only
-- ever accepted p_client_id/p_service_template_id/p_start_date/p_due_date,
-- so the rest of the review screen would have had nothing real to submit to.
-- Rather than call the approved RPC and then separately UPDATE the rows it
-- just created (a fake "atomic" activation), this extends the RPC itself
-- with optional trailing parameters (all default NULL, so existing callers
-- are unaffected) and sets them on both the services row and its engagement
-- in the same transaction the RPC already runs in.

CREATE OR REPLACE FUNCTION public.apply_service_template_to_client(
  p_client_id uuid,
  p_service_template_id uuid,
  p_start_date date DEFAULT CURRENT_DATE,
  p_due_date date DEFAULT NULL::date,
  p_assigned_to uuid DEFAULT NULL::uuid,
  p_price numeric DEFAULT NULL::numeric,
  p_service_year text DEFAULT NULL::text,
  p_billing_frequency text DEFAULT NULL::text,
  p_is_recurring boolean DEFAULT NULL::boolean
)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

-- CREATE OR REPLACE above created a second overload rather than truly
-- replacing the original 4-arg function (verified live: both signatures
-- existed simultaneously right after this ran, which also reset execute
-- grants to the Postgres default and re-opened PUBLIC/anon access). Drop
-- the stale overload and re-close the grants the 20260721090000 migration
-- had already locked down.
DROP FUNCTION IF EXISTS public.apply_service_template_to_client(uuid, uuid, date, date);

REVOKE ALL ON FUNCTION public.apply_service_template_to_client(uuid, uuid, date, date, uuid, numeric, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_service_template_to_client(uuid, uuid, date, date, uuid, numeric, text, text, boolean) TO authenticated;
