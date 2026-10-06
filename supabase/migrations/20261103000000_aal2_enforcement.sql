-- VEREXA-AAL-001: the only AAL check anywhere in this schema today lives in
-- lib/supabase/middleware.ts, a Next.js page-navigation redirect that is
-- explicitly skipped for every /api/* route and never consulted by any
-- SECURITY DEFINER function or RLS policy -- a password-only (stolen
-- credential) session is indistinguishable from a fully-verified one at the
-- database layer. has_aal2() closes that specifically for the handful of
-- genuinely high-impact operations identified in the AAL-001 remediation
-- design (reveal_my_ptin, and the workspace security policy itself), using
-- the exact same `aal` JWT claim the application layer now also checks
-- (lib/auth/requireAal2.ts) -- PostgREST passes the verified JWT's claims
-- into Postgres as auth.jwt() on every authenticated request, the same
-- trust boundary auth.uid() (and therefore has_permission()/
-- is_workspace_admin()) already relies on throughout this schema, so this
-- requires no new mechanism and no extra round trip.
--
-- Mirrors has_permission()/is_workspace_admin()'s existing shape exactly
-- (STABLE SECURITY DEFINER, search_path pinned, explicit anon/public revoke
-- + authenticated grant -- the same hardening already applied to
-- reveal_my_ptin() itself in 20260815152816_security_audit_revoke_anon_grants.sql).
-- SECURITY DEFINER here is not a privilege escalation: the function body
-- only ever reads the CALLER's own already-verified JWT claims (auth.jwt()),
-- the same thing is_workspace_admin()/has_permission() do by reading
-- auth.uid() -- it grants no access to any other session's data, and a
-- service-role caller (which bypasses auth.jwt()-based checks by never
-- going through PostgREST's user-JWT path to begin with) is unaffected
-- either way, consistent with every other has_permission()-style helper.
create or replace function public.has_aal2()
returns boolean
language sql
stable security definer
set search_path to 'public'
as $function$
  select coalesce(auth.jwt()->>'aal', 'aal1') = 'aal2';
$function$;

revoke all on function public.has_aal2() from public, anon;
grant execute on function public.has_aal2() to authenticated;

-- reveal_my_ptin(): decrypts and returns a plaintext PTIN with no AAL check
-- today -- a stolen password alone is sufficient to exfiltrate this PII via
-- a direct RPC call, bypassing the application layer entirely. The guard
-- runs before decryption, so no plaintext is ever computed for an AAL1
-- caller. Existing auth.uid() scoping (a user can only ever reveal their
-- OWN PTIN) and the existing audit_log insert are both unchanged.
create or replace function public.reveal_my_ptin()
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_value text;
  v_workspace_id uuid;
begin
  if not public.has_aal2() then
    raise exception 'This action requires two-factor verification. Complete your authenticator challenge and try again.';
  end if;

  select public.decrypt_firm_secret(ptin_encrypted) into v_value from public.user_profiles where id = auth.uid();

  select workspace_id into v_workspace_id from public.workspace_users where user_id = auth.uid() and status = 'active' limit 1;
  insert into public.audit_log (workspace_id, actor_id, entity_type, entity_id, action, severity)
  values (v_workspace_id, auth.uid(), 'user_profiles', auth.uid(), 'reveal_ptin', 'warning');

  return v_value;
end;
$function$;

-- NOTE on workspace_security_policies.mfa_required (evaluated, not
-- changed): gating the whole workspace_security_policies_update RLS policy
-- behind has_aal2() was considered and deliberately NOT implemented. That
-- table's update path is the same one an admin uses to turn mfa_required
-- ON for the very first time -- an admin who has never enrolled a factor
-- (because their workspace never required one yet) would have
-- currentLevel/nextLevel stuck at "aal1" with no verified factor to
-- challenge, so a blanket has_aal2() gate here would permanently lock
-- every such admin out of ever enabling MFA for their own workspace, not
-- just out of disabling it -- a bootstrap/chicken-and-egg problem, not a
-- "broad RLS rewrite" concern but a real correctness one. Closing the
-- actual attack this finding is about (a stolen aal1 session silently
-- turning MFA off) needs a narrower rule than "has_aal2() unconditionally"
-- -- e.g. only when flipping mfa_required from true to false, which reads
-- the pre-update row and is a materially bigger, column-aware policy than
-- the simple pattern used everywhere else in this migration -- so this is
-- left for a follow-up design decision rather than broadened here.
