-- Two SECURITY DEFINER functions had no authorization check at all --
-- found by the first Verexa Security Agent run (critical + high severity).
--
-- search_clients(p_workspace_id, ...) never checked that the caller belongs
-- to p_workspace_id, and PUBLIC execute was never revoked -- confirmed
-- exploitable by a fully unauthenticated (anon) caller to pull another
-- workspace's client PII (name, email, phone, lifecycle_status), and the
-- ssn_last4/ein_last4 exact-match filter doubles as a confirmation oracle.
-- Fix: same is_workspace_member() gate every other client/workspace list
-- RPC already uses (e.g. get_dashboard_action_queue_widgets,
-- get_ero_connected_partners) -- converts the function from a plain SQL
-- function to plpgsql so it can raise on failure, body otherwise unchanged.
--
-- notify_workspace_admins(p_workspace_id, ...) had no check either, and was
-- explicitly granted to `authenticated` (not just service_role) -- any
-- logged-in user could insert real notification rows targeting another
-- workspace's Owner/Admin with attacker-controlled payload. Its only real
-- callers (app/api/cron/send-pending-portal-invites,
-- lib/systemFailures.ts's sibling account-notification path) already run
-- under the service-role key, which never needed the `authenticated` grant
-- in the first place. Fix: revoke from public/anon/authenticated, matching
-- the create_client_relationship/create_workspace precedent
-- (20260805235101_revoke_public_execute.sql,
-- 20260822060000_close_self_serve_signup_gap.sql) for internal-only helpers
-- -- service_role keeps working since Postgres grants aren't checked
-- against it here the way PostgREST's anon/authenticated roles are.

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

revoke execute on function public.notify_workspace_admins(uuid, text, text, jsonb, text[], text, text, uuid) from public, anon, authenticated;
