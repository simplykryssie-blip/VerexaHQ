-- Advanced Contacts search: one text query across name/email/phone/tax-ID
-- last-4/engagement number, plus filter chips for service, assigned staff,
-- pipeline stage, missing documents, and outstanding balance. None of these
-- live on a single table (engagement number and pipeline stage hang off
-- engagements/pipeline_runs, missing docs off document_request_item_statuses,
-- balance off invoices), so this is a server-side RPC rather than a client
-- query built out of chained .or()/.contains() calls -- keeps pagination
-- correct against the filtered set instead of paginating pre-filter rows.
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
  p_limit int default 50,
  p_offset int default 0
)
returns table (
  id uuid,
  client_type text,
  first_name text,
  last_name text,
  business_name text,
  primary_email text,
  primary_phone text,
  lifecycle_status text,
  tags text[],
  total_count bigint
)
language sql
stable
security definer
set search_path to 'public'
as $$
  with matched as (
    select c.*
    from public.clients c
    where c.workspace_id = p_workspace_id
      and c.merged_into_client_id is null
      and (p_lifecycle_statuses is null or c.lifecycle_status = any(p_lifecycle_statuses))
      and (p_tag is null or p_tag = any(c.tags))
      and (p_assigned_staff_id is null or c.relationship_manager_id = p_assigned_staff_id)
      and (
        p_query is null or btrim(p_query) = '' or
        c.first_name ilike '%' || p_query || '%' or
        c.last_name ilike '%' || p_query || '%' or
        c.business_name ilike '%' || p_query || '%' or
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
              or (pr.entity_type = 'engagement' and pr.entity_id in (select id from public.engagements e2 where e2.client_id = c.id))
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
              or (dr.entity_type = 'engagement' and dr.entity_id in (select id from public.engagements e3 where e3.client_id = c.id))
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
  select id, client_type, first_name, last_name, business_name, primary_email, primary_phone, lifecycle_status, tags,
    count(*) over() as total_count
  from matched
  order by created_at desc
  limit p_limit offset p_offset;
$$;
