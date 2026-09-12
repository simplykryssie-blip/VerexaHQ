-- Workflow conditions already had a way to branch on a document's signature
-- state ("engagement.engagement_letter_status": not_sent/pending/completed/
-- declined), but it's buried under the "Engagement" group as "Document
-- signature status" and requires picking "equals" + "Signed" -- a user
-- looking for a plain yes/no "has this document been signed?" branch didn't
-- find it. Adds a second, boolean condition field on the same underlying
-- signature_requests/attachments lookup so a Condition step can just ask
-- "Document signed? Yes/No" directly, no separate value dropdown needed.
-- The existing detailed field is untouched for anyone who wants to branch
-- on pending/declined specifically.

create or replace function public._evaluate_condition_list(p_conditions jsonb, p_context jsonb, p_workspace_id uuid, p_client_id uuid, p_engagement_id uuid)
returns boolean
language plpgsql
stable
set search_path to 'public'
as $function$
declare
  v_cond jsonb;
  v_field text;
  v_op text;
  v_join text;
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
  v_org_template_id_raw text;
  v_org_template_id uuid;
  v_org_expected_status text;
  v_org_actual_status text;
  v_match boolean;
  v_result boolean;
  v_index int := 0;
begin
  if p_conditions is null or jsonb_array_length(p_conditions) = 0 then
    return true;
  end if;

  select * into v_client from public.clients where id = p_client_id;
  select * into v_interest from public.client_service_interests where client_id = p_client_id order by created_at desc limit 1;
  select * into v_portal from public.client_portal_users where client_id = p_client_id order by invited_at desc limit 1;
  select * into v_engagement from public.engagements where id = p_engagement_id;
  select pr.process_id, ps.process_stage_id into v_process_id, v_process_stage_id
  from public.pipeline_runs pr
  join public.pipeline_stages ps on ps.id = pr.current_stage_id
  where pr.entity_type = 'engagement' and pr.entity_id = p_engagement_id and pr.status = 'Active'
  order by pr.started_at desc limit 1;
  select ps.process_stage_id into v_lead_process_stage_id
  from public.pipeline_runs pr
  join public.pipeline_stages ps on ps.id = pr.current_stage_id
  where pr.entity_type = 'client' and pr.entity_id = p_client_id and pr.status = 'Active'
  order by pr.started_at desc limit 1;
  select * into v_quote from public.quotes
  where (p_engagement_id is not null and engagement_id = p_engagement_id)
     or (p_client_id is not null and client_id = p_client_id)
  order by created_at desc limit 1;
  select * into v_task from public.tasks where id = nullif(p_context->>'task_id', '')::uuid;
  select * into v_doc_request from public.document_requests where id = nullif(p_context->>'document_request_id', '')::uuid;

  for v_cond in select * from jsonb_array_elements(p_conditions)
  loop
    v_index := v_index + 1;
    v_field := v_cond->>'field';
    v_op := coalesce(v_cond->>'op', 'eq');
    v_join := coalesce(v_cond->>'join', 'and');
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
    elsif v_field = 'client.organizer_status' then
      v_org_template_id_raw := split_part(coalesce(v_expected, ''), '|', 1);
      v_org_expected_status := split_part(coalesce(v_expected, ''), '|', 2);
      v_org_template_id := case
        when v_org_template_id_raw = 'current_run' then nullif(p_context->>'last_organizer_template_id', '')::uuid
        when v_org_template_id_raw = 'client_service' then (
          select os.template_id
          from public.organizer_submissions os
          where os.client_id = p_client_id
          order by os.created_at desc
          limit 1
        )
        else nullif(v_org_template_id_raw, '')::uuid
      end;
      select os.status into v_org_actual_status
      from public.organizer_submissions os
      where os.client_id = p_client_id and os.template_id = v_org_template_id
      order by os.created_at desc
      limit 1;
      v_match := coalesce(v_org_actual_status, 'not_sent') = v_org_expected_status;
      if v_op = 'neq' then
        v_match := not v_match;
      end if;
    else
      v_actual := case v_field
        when 'client.lifecycle_status' then v_client.lifecycle_status
        when 'client.client_type' then v_client.client_type
        when 'client.relationship_manager_id' then v_client.relationship_manager_id::text
        when 'client.service_category_id' then v_interest.service_category_id::text
        when 'client.service_id' then v_interest.service_id::text
        when 'client.source' then v_interest.source
        when 'client.portal_status' then coalesce(v_portal.status, 'not_sent')
        when 'lead.process_stage_id' then v_lead_process_stage_id::text
        when 'engagement.status' then v_engagement.status
        when 'engagement.priority' then v_engagement.priority::text
        when 'engagement.case_type' then v_engagement.case_type
        when 'engagement.service_id' then v_engagement.service_id::text
        when 'engagement.assigned_staff_id' then v_engagement.assigned_staff_id::text
        when 'engagement.reviewer_id' then v_engagement.reviewer_id::text
        when 'engagement.process_id' then v_process_id::text
        when 'engagement.process_stage_id' then v_process_stage_id::text
        when 'engagement.engagement_letter_status' then coalesce(
          nullif((
            select sr.status
            from public.signature_requests sr
            join public.attachments a on a.id = sr.attachment_id
            where a.entity_type = 'engagement' and a.entity_id = p_engagement_id
            order by sr.created_at desc
            limit 1
          ), 'cancelled'),
          'not_sent'
        )
        when 'engagement.document_signed' then (coalesce(
          nullif((
            select sr.status
            from public.signature_requests sr
            join public.attachments a on a.id = sr.attachment_id
            where a.entity_type = 'engagement' and a.entity_id = p_engagement_id
            order by sr.created_at desc
            limit 1
          ), 'cancelled'),
          'not_sent'
        ) = 'completed')::text
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

    if v_index = 1 then
      v_result := v_match;
    elsif v_join = 'or' then
      v_result := v_result or v_match;
    else
      v_result := v_result and v_match;
    end if;
  end loop;

  return v_result;
end;
$function$;
