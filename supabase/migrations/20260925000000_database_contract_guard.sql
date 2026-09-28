-- Database contract guard: a read-only introspection RPC backing a CI check
-- (tests/database-contract-guard.test.ts) that catches the exact class of
-- migration-discipline regression that produced two confirmed
-- vulnerabilities this engagement fixed -- provision_phone_number_record/
-- bill_and_pause_phone_numbers (missed revoke of a default authenticated
-- grant) and resolve_organizer_response_service (a deliberate-but-
-- unnecessary authenticated grant, SD-1). Both were SECURITY DEFINER
-- functions (bypass RLS), authenticated-executable, mutating, and accepted
-- a workspace/resource identifier with no internal authorization check.
--
-- This function does no writes and inspects only pg_catalog/
-- information_schema metadata -- no application data is read. It returns
-- one row per SECURITY DEFINER function in the public schema that is
-- currently authenticated- or anon-executable, has more than one overload,
-- or is explicitly requested via p_always_include (so a caller can assert
-- the *absence* of a dangerous grant on a specific known-sensitive
-- function, not just its absence from an otherwise-filtered result set).
-- The policy decisions (which functions are known-safe public/token-based,
-- which must never regain a grant, what the accepted overload count is)
-- live in the CI test's checked-in baseline file, not in this function --
-- keeping the SQL side a stable set of facts and the policy side easy to
-- review and update in a normal PR.

create or replace function public.run_database_contract_guard(p_always_include text[] default '{}')
returns table (
  function_name text,
  args text,
  overload_count integer,
  is_security_definer boolean,
  authenticated_exec boolean,
  anon_exec boolean,
  service_role_exec boolean,
  is_mutation boolean,
  has_identifier_arg boolean,
  has_recognized_auth boolean,
  has_token_lookup boolean
)
language sql
security definer
set search_path to 'public'
as $$
  with fn as (
    select
      p.oid,
      p.proname,
      pg_get_function_identity_arguments(p.oid) as args,
      p.prosecdef,
      p.prosrc,
      (p.proname || '_' || p.oid::text) as specific_name,
      count(*) over (partition by p.proname) as overload_count
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef = true
  ),
  grants as (
    select rp.specific_name, array_agg(distinct rp.grantee::text order by rp.grantee::text) as grantees
    from information_schema.routine_privileges rp
    where rp.specific_schema = 'public' and rp.privilege_type = 'EXECUTE'
    group by rp.specific_name
  )
  select
    f.proname,
    f.args,
    f.overload_count::int,
    f.prosecdef,
    coalesce(g.grantees @> array['authenticated'], false),
    coalesce(g.grantees @> array['anon'], false),
    coalesce(g.grantees @> array['service_role'], false),
    (f.prosrc ~* '\y(insert|update|delete)\y'),
    (f.args ~* 'workspace_id|client_id|user_id|connection_id|engagement_id|seat_id|phone|signature|invite|token'),
    (f.prosrc ~* 'auth\.uid\(\)|has_permission|is_workspace_admin|is_workspace_member|is_workspace_operational|is_platform_admin|is_platform_it|is_platform_ai_operator|has_config_object_share_access|has_pending_engagement_share_access|has_learning_hub_access|can_use_network_messaging|is_portal_member|is_portal_user|is_pending_signer_for_signature_request|is_partner_workspace_for_firm_connection|is_operationally_active_partner|can_access_admin_ai|is_account_locked'),
    (f.prosrc ~* '(where|and)\s+\w*\.?token\s*=\s*p_token|token\s*=\s*p_token')
  from fn f
  left join grants g on g.specific_name = f.specific_name
  where coalesce(g.grantees @> array['authenticated'], false)
     or coalesce(g.grantees @> array['anon'], false)
     or f.overload_count > 1
     or f.proname = any(p_always_include)
  order by f.proname, f.args;
$$;

revoke all on function public.run_database_contract_guard(text[]) from public, anon, authenticated;
grant execute on function public.run_database_contract_guard(text[]) to service_role;
