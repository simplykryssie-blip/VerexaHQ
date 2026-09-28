-- IA CONSOLIDATION -- Contacts absorbs client assignment: adds a real
-- "Unassigned" filter value to search_clients, so the Assigned-to filter can
-- offer All/Unassigned/specific-staff entirely server-side (correct against
-- the full matching set, not just the currently-loaded page) -- the same
-- guarantee p_assigned_staff_id already gives for a specific staff member,
-- and the same query "select all matching" (ContactsBulkTable.tsx) reissues
-- unpaginated for cross-page bulk selection.
--
-- Adds p_unassigned_only as a new trailing parameter with a default, so this
-- remains backward compatible for any existing caller -- but since Postgres
-- registers a changed argument list as a brand-new function identity rather
-- than replacing the old one (the exact trap this codebase already hit for
-- create_engagement, create_client, set_firm_tax_profile, and search_clients
-- itself), the prior 14-arg identity is dropped explicitly first.

drop function if exists public.search_clients(uuid, text, text[], text, uuid, uuid, text, boolean, boolean, text, boolean, boolean, integer, integer);

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
  p_offset integer default 0,
  p_unassigned_only boolean default false
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
      and (p_unassigned_only is not true or c.relationship_manager_id is null)
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

-- DROP FUNCTION removes the prior identity's ACL entirely, and Postgres
-- grants EXECUTE to PUBLIC by default on a newly created function -- revoke
-- that explicitly to preserve this codebase's existing least-privilege
-- posture for this function (20260919122926_least_privilege_public_grant_corrective_fix.sql),
-- rather than silently reintroducing a public/anon execute grant.
revoke all on function public.search_clients(uuid, text, text[], text, uuid, uuid, text, boolean, boolean, text, boolean, boolean, integer, integer, boolean) from public, anon;
grant execute on function public.search_clients(uuid, text, text[], text, uuid, uuid, text, boolean, boolean, text, boolean, boolean, integer, integer, boolean) to authenticated;
