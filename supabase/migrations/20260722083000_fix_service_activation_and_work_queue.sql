-- apply_service_template_to_client had multiple real bugs, verified live
-- with a real test client before and after this fix:
--
-- 1. Column-name mismatches against the live schema: inserted into
--    services.status (real column: service_status), tasks.title/
--    description/status (real columns: task_title/task_description/
--    task_status) plus a nonexistent tasks.created_by, documents.status
--    (real column: document_status), client_checklist_items.status (real
--    column: item_status), and client_form_assignments.form_template_id
--    (real column: template_id). The function failed on its very first
--    INSERT every time it was called — it had never worked.
-- 2. The template lookup required workspace_id = target_workspace_id, but
--    all 5 live service_templates rows are platform templates
--    (workspace_id IS NULL, is_platform_template = true), which a NULL
--    can never match — so even after fixing #1, no template could ever be
--    found for any workspace.
-- 3. It never created an engagements row, so even fully fixed it would
--    only produce a bare services row, not a real Service Workspace as
--    read by v_engagement_workspace / get_client_work_contract.
--
-- This fixes all three: correct column names, accepts platform templates,
-- and creates the engagement (linking every generated task, document,
-- checklist item, and form assignment to it via engagement_id — a column
-- that already existed on all four tables, unused until now). The return
-- value (service_id) is unchanged to preserve the documented signature;
-- callers resolve the engagement via engagements.service_id.
--
-- Verified end-to-end against a real test client: two services applied
-- (Monthly Bookkeeping, Individual Tax Preparation) produced two separate
-- engagements with correct pipeline stages and 11 real tasks, all visible
-- through v_engagement_workspace and get_client_work_contract.

CREATE OR REPLACE FUNCTION public.apply_service_template_to_client(p_client_id uuid, p_service_template_id uuid, p_start_date date DEFAULT CURRENT_DATE, p_due_date date DEFAULT NULL::date)
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
    price,
    start_date,
    due_date,
    pipeline_id,
    pipeline_stage_id
  ) values (
    target_workspace_id,
    p_client_id,
    template_record.service_type,
    template_record.template_name,
    'New',
    template_record.default_price,
    p_start_date,
    p_due_date,
    template_record.default_pipeline_id,
    first_stage_id
  ) returning id into new_service_id;

  insert into public.engagements (
    workspace_id,
    account_id,
    service_id,
    engagement_name,
    engagement_type,
    period_start,
    period_end,
    pipeline_id,
    pipeline_stage_id,
    status,
    due_date
  ) values (
    target_workspace_id,
    p_client_id,
    new_service_id,
    template_record.template_name,
    template_record.service_type,
    p_start_date,
    p_due_date,
    template_record.default_pipeline_id,
    first_stage_id,
    'active',
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

-- get_firm_work_queue filtered tasks with task_status not in
-- ('completed','canceled','archived') — lowercase — but live task_status
-- values are capitalized ('To Do','In Progress','Completed'), so completed
-- tasks were never actually excluded from the queue. Verified live: after
-- completing a test task via complete_task(), it still appeared in the
-- queue count until this fix. Switched to a case-insensitive comparison.

CREATE OR REPLACE FUNCTION public.get_firm_work_queue(p_workspace_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.is_platform_admin()
     and not exists (select 1 from public.workspace_members wm where wm.workspace_id=p_workspace_id and wm.user_id=auth.uid()) then
    raise exception 'Not allowed to view firm work queue';
  end if;

  return jsonb_build_object(
    'tasks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id,
        'task_title', t.task_title,
        'task_status', t.task_status,
        'priority', t.priority,
        'due_date', t.due_date,
        'client_id', t.client_id,
        'client_name', coalesce(nullif(c.business_name,''), nullif(trim(coalesce(c.first_name,'') || ' ' || coalesce(c.last_name,'')), ''), c.email),
        'service_id', t.service_id,
        'assigned_to', t.assigned_to
      ) order by t.due_date asc nulls last, t.created_at desc)
      from public.tasks t
      left join public.clients c on c.id=t.client_id
      where t.workspace_id=p_workspace_id and lower(coalesce(t.task_status,'')) not in ('completed','canceled','cancelled','archived')
      limit 100
    ), '[]'::jsonb),
    'portal_todos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', todo.id,
        'todo_type', todo.todo_type,
        'title', todo.title,
        'todo_status', todo.todo_status,
        'due_date', todo.due_date,
        'client_id', todo.client_id,
        'client_name', coalesce(nullif(c.business_name,''), nullif(trim(coalesce(c.first_name,'') || ' ' || coalesce(c.last_name,'')), ''), c.email),
        'related_table', todo.related_table,
        'related_id', todo.related_id
      ) order by todo.due_date asc nulls last, todo.created_at desc)
      from public.client_portal_todos todo
      left join public.clients c on c.id=todo.client_id
      where todo.workspace_id=p_workspace_id and todo.todo_status in ('open','in_progress','blocked')
      limit 100
    ), '[]'::jsonb),
    'documents_for_review', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', d.id,
        'document_name', d.document_name,
        'document_category', d.document_category,
        'document_status', d.document_status,
        'client_id', d.client_id,
        'client_name', coalesce(nullif(c.business_name,''), nullif(trim(coalesce(c.first_name,'') || ' ' || coalesce(c.last_name,'')), ''), c.email),
        'received_date', d.received_date,
        'uploaded_at', d.uploaded_at
      ) order by d.uploaded_at asc nulls last, d.received_date asc nulls last)
      from public.documents d
      left join public.clients c on c.id=d.client_id
      where d.workspace_id=p_workspace_id and d.document_status in ('uploaded','received','in_review')
      limit 100
    ), '[]'::jsonb),
    'organizers_for_review', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id,
        'assignment_status', a.assignment_status,
        'submitted_at', a.submitted_at,
        'client_id', a.client_id,
        'client_name', coalesce(nullif(c.business_name,''), nullif(trim(coalesce(c.first_name,'') || ' ' || coalesce(c.last_name,'')), ''), c.email),
        'tax_year', cty.tax_year,
        'return_type', cty.return_type
      ) order by a.submitted_at asc nulls last)
      from public.tax_organizer_assignments a
      left join public.clients c on c.id=a.client_id
      left join public.client_tax_years cty on cty.id=a.client_tax_year_id
      where a.workspace_id=p_workspace_id and a.assignment_status in ('submitted','reviewed')
      limit 100
    ), '[]'::jsonb),
    'unpaid_invoices', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id,
        'invoice_number', i.invoice_number,
        'invoice_status', i.invoice_status,
        'due_date', i.due_date,
        'total_amount', i.total_amount,
        'amount_paid', i.amount_paid,
        'client_id', i.client_id,
        'client_name', coalesce(nullif(c.business_name,''), nullif(trim(coalesce(c.first_name,'') || ' ' || coalesce(c.last_name,'')), ''), c.email)
      ) order by i.due_date asc nulls last, i.created_at desc)
      from public.invoices i
      left join public.clients c on c.id=i.client_id
      where i.workspace_id=p_workspace_id and i.invoice_status in ('sent','viewed','partial','overdue')
      limit 100
    ), '[]'::jsonb)
  );
end;
$function$;
