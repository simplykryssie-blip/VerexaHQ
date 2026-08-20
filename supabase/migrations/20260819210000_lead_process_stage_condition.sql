-- Branch conditions had no way to check which stage of a lead's pipeline
-- (lead_pipeline_runs/lead_pipeline_stages) a client is currently sitting
-- in -- only the coarse client.lifecycle_status enum (lead/active/
-- inactive/archived/lost). engagement.process_stage_id already does this
-- for engagements via workflow_runs/workflow_stages; this adds the lead
-- equivalent so a condition step can branch on "is this lead in the
-- Consult Booked stage of the Revenue Pipeline" the same way it already
-- can for engagements.
create or replace function public.evaluate_automation_conditions(
  p_conditions jsonb,
  p_context jsonb,
  p_workspace_id uuid,
  p_client_id uuid,
  p_engagement_id uuid
)
returns boolean
language plpgsql
stable
set search_path to 'public'
as $function$
declare
  v_cond jsonb;
  v_field text;
  v_op text;
  v_expected text;
  v_actual text;
  v_client record;
  v_engagement record;
  v_interest record;
  v_portal record;
  v_quote record;
  v_task record;
  v_doc_request record;
  v_process_id uuid;
  v_process_stage_id uuid;
  v_lead_process_stage_id uuid;
  v_match boolean;
begin
  if p_conditions is null or jsonb_array_length(p_conditions) = 0 then
    return true;
  end if;

  -- Every lookup below runs unconditionally (with the relevant id possibly
  -- null, which naturally yields zero rows). plpgsql compiles the CASE
  -- expression further down as a single SQL statement, so a record variable
  -- that was never assigned via SELECT INTO has an indeterminate row type
  -- and errors out even on branches that aren't taken -- guarding these
  -- selects behind "if id is not null" left v_task/v_doc_request/etc.
  -- unassigned whenever a trigger's context didn't include that id, which
  -- broke evaluation of any condition on an unrelated field.
  select * into v_client from public.clients where id = p_client_id;
  select * into v_interest from public.client_service_interests where client_id = p_client_id order by created_at desc limit 1;
  select * into v_portal from public.client_portal_users where client_id = p_client_id order by invited_at desc limit 1;
  select * into v_engagement from public.engagements where id = p_engagement_id;
  select wr.process_id, ws.process_stage_id into v_process_id, v_process_stage_id
  from public.workflow_runs wr
  join public.workflow_stages ws on ws.id = wr.current_stage_id
  where wr.engagement_id = p_engagement_id and wr.status = 'Active';
  select lps.process_stage_id into v_lead_process_stage_id
  from public.lead_pipeline_runs lr
  join public.lead_pipeline_stages lps on lps.id = lr.current_stage_id
  where lr.client_id = p_client_id and lr.status = 'Active';
  select * into v_quote from public.quotes
  where (p_engagement_id is not null and engagement_id = p_engagement_id)
     or (p_client_id is not null and client_id = p_client_id)
  order by created_at desc limit 1;
  select * into v_task from public.tasks where id = nullif(p_context->>'task_id', '')::uuid;
  select * into v_doc_request from public.document_requests where id = nullif(p_context->>'document_request_id', '')::uuid;

  for v_cond in select * from jsonb_array_elements(p_conditions)
  loop
    v_field := v_cond->>'field';
    v_op := coalesce(v_cond->>'op', 'eq');
    v_expected := v_cond->>'value';

    if v_field = 'client.tags' then
      v_match := v_expected = any(coalesce(v_client.tags, '{}'::text[]));
      if v_op = 'neq' then
        v_match := not v_match;
      end if;
    elsif v_field = 'document_request.all_required_complete' then
      v_match := (coalesce(v_expected, 'true') = 'true') = not exists (
        select 1 from public.document_request_item_statuses
        where document_request_id = coalesce((p_context->>'document_request_id')::uuid, v_doc_request.id)
          and is_required = true and status = 'pending'
      );
    else
      v_actual := case v_field
        when 'client.lifecycle_status' then v_client.lifecycle_status
        when 'client.client_type' then v_client.client_type
        when 'client.relationship_manager_id' then v_client.relationship_manager_id::text
        when 'client.service_category_id' then v_interest.service_category_id::text
        when 'client.service_id' then v_interest.service_id::text
        when 'client.source' then v_interest.source
        when 'client.portal_status' then v_portal.status
        when 'lead.process_stage_id' then v_lead_process_stage_id::text
        when 'engagement.status' then v_engagement.status
        when 'engagement.priority' then v_engagement.priority::text
        when 'engagement.case_type' then v_engagement.case_type
        when 'engagement.service_id' then v_engagement.service_id::text
        when 'engagement.assigned_staff_id' then v_engagement.assigned_staff_id::text
        when 'engagement.reviewer_id' then v_engagement.reviewer_id::text
        when 'engagement.process_id' then v_process_id::text
        when 'engagement.process_stage_id' then v_process_stage_id::text
        when 'quote.status' then v_quote.status
        when 'quote.total_amount' then v_quote.total_amount::text
        when 'task.status' then v_task.status
        when 'task.assigned_staff_id' then v_task.assigned_staff_id::text
        when 'task.overdue' then (v_task.due_date is not null and v_task.due_date < now() and v_task.status <> 'completed')::text
        when 'document_request.status' then v_doc_request.status
        else p_context ->> v_field
      end;

      if v_op = 'eq' then
        v_match := v_actual is not distinct from v_expected;
      elsif v_op = 'neq' then
        v_match := v_actual is distinct from v_expected;
      elsif v_op = 'in' then
        v_match := v_actual = any(string_to_array(coalesce(v_expected, ''), ','));
      elsif v_op = 'not_in' then
        v_match := v_actual is not null and not (v_actual = any(string_to_array(coalesce(v_expected, ''), ',')));
      elsif v_op = 'gt' then
        v_match := v_actual is not null and v_expected is not null and v_actual::numeric > v_expected::numeric;
      elsif v_op = 'gte' then
        v_match := v_actual is not null and v_expected is not null and v_actual::numeric >= v_expected::numeric;
      elsif v_op = 'lt' then
        v_match := v_actual is not null and v_expected is not null and v_actual::numeric < v_expected::numeric;
      elsif v_op = 'lte' then
        v_match := v_actual is not null and v_expected is not null and v_actual::numeric <= v_expected::numeric;
      elsif v_op = 'is_null' then
        v_match := v_actual is null;
      elsif v_op = 'is_not_null' then
        v_match := v_actual is not null;
      else
        v_match := true;
      end if;
    end if;

    if not v_match then
      return false;
    end if;
  end loop;

  return true;
end;
$function$;
