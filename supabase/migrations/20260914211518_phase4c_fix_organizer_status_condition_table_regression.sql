-- ============================================================================
-- MIGRATION RECONCILIATION PHASE 1.9 -- RECOVERED FROM PRODUCTION (PR #268)
--
-- Did not previously exist in Git main. Applied directly to production
-- during the MKB Tax Prep + Client Review + F1/F2/NW-1 security work
-- (PR #268, branch claude/verexa-schema-mismatch-i8c19u, never merged).
-- This filename's version already exactly matches the real recorded
-- production version in supabase_migrations.schema_migrations -- no rename
-- needed. Content verified byte-for-byte (modulo a single trailing
-- newline) against schema_migrations.statements. Confidence: A -- exact
-- original recovered.
-- ============================================================================
-- Phase 4C Part 1: client.organizer_status has been raising
-- 42P01 "relation public.organizer_submissions does not exist" since
-- migration 20260912120000_add_document_signed_condition_field.sql
-- accidentally replaced its correct public.organizer_responses lookup
-- (introduced in 20260822140000, still correct as of 20260827190000)
-- with a nonexistent public.organizer_submissions table while adding an
-- unrelated run.document_signed field to this same function. This broke
-- an enabled, live production automation
-- (185626b5-9feb-4d0c-908d-33e368273f19, "Software/ Banking Package
-- Purchased", workspace 0867bbc5-e62b-4217-8bad-11351c24def5).
--
-- This restores the pre-regression behavior exactly: both organizer
-- template resolution modes (a literal template id, and 'client_service'
-- resolved via the client's most recent service -> that service's
-- organizer template -> the matching template in this workspace, per
-- 20260827190000) and the actual-status lookup now read from
-- public.organizer_responses (client_id, organizer_template_id, status),
-- the real, existing table this was always meant to query. No condition
-- field name, value format, or operator semantics changed -- only the
-- data source the field name already promised.
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
  v_doc_step_id_raw text;
  v_doc_expected_signed text;
  v_doc_actual_status text;
  v_task_step_id_raw text;
  v_task_expected_completed text;
  v_task_actual_status text;
  v_decision_step_id_raw text;
  v_decision_expected_option text;
  v_decision_actual_option text;
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
          select ot.id
          from public.services s
          join public.organizer_templates svc_ot on svc_ot.id = s.organizer_template_id
          join public.organizer_templates ot on ot.slug = svc_ot.slug and ot.workspace_id = p_workspace_id
          where s.id = coalesce(nullif(p_context->>'service_id', '')::uuid, v_interest.service_id)
          limit 1
        )
        else nullif(v_org_template_id_raw, '')::uuid
      end;
      select status into v_org_actual_status
      from public.organizer_responses
      where client_id = p_client_id and organizer_template_id = v_org_template_id
      order by created_at desc
      limit 1;
      v_match := coalesce(v_org_actual_status, 'not_sent') = v_org_expected_status;
      if v_op = 'neq' then
        v_match := not v_match;
      end if;
    elsif v_field = 'run.document_signed' then
      v_doc_step_id_raw := split_part(coalesce(v_expected, ''), '|', 1);
      v_doc_expected_signed := coalesce(nullif(split_part(coalesce(v_expected, ''), '|', 2), ''), 'true');
      select sr.status into v_doc_actual_status
      from public.signature_requests sr
      where sr.id = nullif(p_context->'document_signatures'->>v_doc_step_id_raw, '')::uuid;
      v_match := (coalesce(v_doc_actual_status, 'not_sent') = 'completed') = (v_doc_expected_signed = 'true');
      if v_op = 'neq' then
        v_match := not v_match;
      end if;
    elsif v_field = 'run.task_completed' then
      v_task_step_id_raw := split_part(coalesce(v_expected, ''), '|', 1);
      v_task_expected_completed := coalesce(nullif(split_part(coalesce(v_expected, ''), '|', 2), ''), 'true');
      select t.status into v_task_actual_status
      from public.tasks t
      where t.id = nullif(p_context->'created_tasks'->>v_task_step_id_raw, '')::uuid;
      v_match := (coalesce(v_task_actual_status, 'pending') = 'completed') = (v_task_expected_completed = 'true');
      if v_op = 'neq' then
        v_match := not v_match;
      end if;
    elsif v_field = 'run.decision' then
      v_decision_step_id_raw := split_part(coalesce(v_expected, ''), '|', 1);
      v_decision_expected_option := split_part(coalesce(v_expected, ''), '|', 2);
      v_decision_actual_option := p_context->'decisions'->>v_decision_step_id_raw;
      v_match := v_decision_actual_option is not distinct from v_decision_expected_option;
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
