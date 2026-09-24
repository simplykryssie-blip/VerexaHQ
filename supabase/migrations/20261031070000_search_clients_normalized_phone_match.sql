-- Contacts Pass 1: search_clients' free-text query never matched a phone
-- number typed in a different punctuation than what's stored (e.g. typing
-- "3378587792" against a client stored as "(337) 858-7792"). clients
-- already has a populated, indexed normalized_phone column (digits-only,
-- kept in sync by the existing sync_client_primary_phone trigger, and
-- already relied on elsewhere -- the Twilio inbound-SMS webhook resolves a
-- client the same way). This migration only adds a normalized_phone match
-- clause to the existing free-text predicate; it does not add a new
-- column, a new index, or a new normalization mechanism, and it does not
-- change any other filter.
--
-- IMPORTANT: this CREATE OR REPLACE keeps the exact same parameter list
-- (names, types, defaults, order) as the current production definition.
-- Postgres keys a function's identity on its argument-type signature, so a
-- changed signature would register as a brand-new overload rather than
-- replacing this one in place -- the exact stale-overload defect
-- 20261031050000_drop_stale_search_clients_overload.sql already had to fix
-- once for this same function. Only the WHERE clause body changes here.
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
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  -- Digits-only version of the caller's query, same normalization
  -- sync_client_primary_phone already applies when populating
  -- normalized_phone -- '' (not null) when the query has no digits at all,
  -- so a name-only search never accidentally matches every row via an
  -- empty '%%' pattern below.
  v_query_digits text := regexp_replace(coalesce(p_query, ''), '\D', '', 'g');
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
        (v_query_digits <> '' and c.normalized_phone ilike '%' || v_query_digits || '%') or
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
$$;
