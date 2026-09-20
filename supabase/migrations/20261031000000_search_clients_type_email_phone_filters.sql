-- CONTACTS COMPLETION PASS -- Phase 1: adds the Client Type filter and the
-- Has-email/Has-phone toggle filters (VEREXAHQ Contacts Reconciliation
-- Audit, Product Decisions #10-12). client_type already exists as a
-- canonical column (clients_client_type_check) and is already shown in the
-- list's Type column -- this only wires it into search_clients as a filter
-- parameter, no schema change. "Account Type" was determined to be a
-- duplicate concept of client_type (no other canonical field exists) and is
-- intentionally not given its own parameter.

create or replace function public.search_clients(
  p_workspace_id uuid,
  p_query text default null,
  p_lifecycle_statuses text[] default null,
  p_tag text default null,
  p_service_id uuid default null,
  p_assigned_staff_id uuid default null,
  p_pipeline_stage_name text default null,
  p_missing_documents boolean default null,
  p_outstanding_balance boolean default null,
  p_client_type text default null,
  p_has_email boolean default null,
  p_has_phone boolean default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table(
  id uuid, client_type text, first_name text, last_name text, business_name text,
  primary_email text, primary_phone text, lifecycle_status text, tags text[], total_count bigint
)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  if not public.is_workspace_member(p_workspace_id) then
    raise exception 'insufficient permissions';
  end if;

  return query
  with matched as (
    select c.*
    from public.clients c
    where c.workspace_id = p_workspace_id
      and c.merged_into_client_id is null
      and (p_lifecycle_statuses is null or c.lifecycle_status = any(p_lifecycle_statuses))
      and (p_tag is null or p_tag = any(c.tags))
      and (p_assigned_staff_id is null or c.relationship_manager_id = p_assigned_staff_id)
      and (p_client_type is null or c.client_type = p_client_type)
      and (p_has_email is null or p_has_email = (c.primary_email is not null))
      and (p_has_phone is null or p_has_phone = (c.primary_phone is not null))
      and (
        p_query is null or btrim(p_query) = '' or
        (coalesce(c.business_name, '') || ' ' || coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')) ilike '%' || p_query || '%' or
        c.primary_email ilike '%' || p_query || '%' or
        c.primary_phone ilike '%' || p_query || '%' or
        c.ssn_last4 = p_query or
        c.ein_last4 = p_query or
        exists (
          select 1 from public.engagements e
          where e.client_id = c.id and e.engagement_number ilike '%' || p_query || '%'
        )
      )
      and (
        p_service_id is null or exists (
          select 1 from public.client_service_interests si where si.client_id = c.id and si.service_id = p_service_id
        ) or exists (
          select 1 from public.engagements e where e.client_id = c.id and e.service_id = p_service_id
        )
      )
      and (
        p_pipeline_stage_name is null or exists (
          select 1
          from public.pipeline_runs pr
          join public.pipeline_stages ps on ps.pipeline_run_id = pr.id and ps.id = pr.current_stage_id
          where pr.status = 'Active' and ps.stage_name = p_pipeline_stage_name
            and (
              (pr.entity_type = 'client' and pr.entity_id = c.id)
              or (pr.entity_type = 'engagement' and pr.entity_id in (select e2.id from public.engagements e2 where e2.client_id = c.id))
            )
        )
      )
      and (
        p_missing_documents is null or p_missing_documents = exists (
          select 1
          from public.document_request_item_statuses dris
          join public.document_requests dr on dr.id = dris.document_request_id
          where dris.is_required = true and dris.status = 'pending'
            and (
              (dr.entity_type = 'client' and dr.entity_id = c.id)
              or (dr.entity_type = 'engagement' and dr.entity_id in (select e3.id from public.engagements e3 where e3.client_id = c.id))
            )
        )
      )
      and (
        p_outstanding_balance is null or p_outstanding_balance = exists (
          select 1 from public.invoices inv
          where inv.client_id = c.id and inv.status not in ('paid', 'voided', 'cancelled') and inv.total_amount > inv.amount_paid
        )
      )
  )
  select matched.id, matched.client_type, matched.first_name, matched.last_name, matched.business_name,
    matched.primary_email::text, matched.primary_phone, matched.lifecycle_status, matched.tags,
    count(*) over() as total_count
  from matched
  order by matched.created_at desc
  limit p_limit offset p_offset;
end;
$function$;
