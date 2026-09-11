-- Critical Phase 4 finding: accept_quote() calls
-- public.start_engagement_workflow(v_engagement_id, v_service.process_id),
-- a function that no longer exists -- it was replaced by the unified
-- public.start_pipeline_run('engagement', entity_id, process_id) during the
-- pipeline-unification refactor (supabase/migrations/
-- 20260825155059_unified_pipeline_functions_triggers_views.sql and the
-- later cutover that dropped the old per-entity functions), but accept_quote
-- was never updated to match. Confirmed live: accepting any quote whose
-- service has a process_id (all but 3 of the platform's services) throws
-- "function public.start_engagement_workflow(uuid, uuid) does not exist"
-- and the whole accept_quote transaction rolls back -- the quote is never
-- marked accepted and no engagement is ever created. Only 1 quote exists in
-- the entire database (the one created live to find this bug), so this
-- appears to have never worked end-to-end for any real customer.

create or replace function public.accept_quote(p_quote_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_quote public.quotes;
  v_service record;
  v_engagement_id uuid;
begin
  select * into v_quote from public.quotes where id = p_quote_id;
  if v_quote.id is null then
    raise exception 'quote not found';
  end if;
  if not public.is_portal_user(v_quote.client_id) then
    raise exception 'not authorized to respond to this quote';
  end if;
  if v_quote.status <> 'sent' then
    raise exception 'this quote is no longer awaiting a response';
  end if;

  update public.quotes set status = 'accepted', accepted_at = now() where id = p_quote_id;

  if v_quote.engagement_id is null and v_quote.service_id is not null then
    select id, process_id, billing_rule_id into v_service
    from public.services
    where id = v_quote.service_id and (workspace_id is null or workspace_id = v_quote.workspace_id);

    if v_service.id is not null then
      insert into public.engagements (workspace_id, client_id, service_id, workflow_id, billing_rule_id, case_type)
      values (v_quote.workspace_id, v_quote.client_id, v_service.id, v_service.process_id, v_service.billing_rule_id, 'other')
      returning id into v_engagement_id;

      if v_service.process_id is not null then
        perform public.start_pipeline_run('engagement', v_engagement_id, v_service.process_id);
      end if;

      update public.quotes set engagement_id = v_engagement_id where id = p_quote_id;
    end if;
  end if;

  perform public._notify_admins_of_quote_response(v_quote.workspace_id, v_quote.client_id, p_quote_id, 'accepted');
end;
$function$;
