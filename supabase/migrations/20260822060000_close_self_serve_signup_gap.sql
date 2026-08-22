-- Real regression: 20260821130000 recreated create_workspace(text, text,
-- text) (to drop the copy_preloaded_templates_to_workspace call) after
-- 20260820203000 had deliberately dropped that exact signature and locked
-- self-serve signup down to a service-role-only 4-arg overload. Recreating
-- a signature that had been dropped makes Postgres treat it as a brand new
-- function object, which gets the default PUBLIC execute grant unless
-- explicitly revoked -- and that revoke was missed. Net effect: ANY
-- authenticated user could call create_workspace(text,text,text) directly
-- and spin up their own workspace, via app/onboarding (the landing page for
-- any authenticated-but-workspace-less user) or app/join (the ERO/Service
-- Bureau connection-invite acceptance page) or a bare RPC call bypassing
-- both UIs entirely -- exactly the "form anyone can find and use to spin
-- up their own firm" the original lock was meant to close.
--
-- app/join's use is legitimate and needs to keep working: accepting a
-- firm_connections invite auto-creates the invitee's own independent
-- workspace. So instead of relocking create_workspace(text,text,text)
-- itself (which app/onboarding also calls, illegitimately), this adds a
-- single new entry point that validates a real, pending, unexpired invite
-- token *before* creating anything, then creates the workspace and
-- redeems the invite atomically -- if the token is bad, or
-- redeem_firm_connection_invite's own checks fail (expired, already used,
-- self-connect, already connected), the whole call raises and the
-- workspace insert it made rolls back with it in the same transaction.
-- create_workspace(text,text,text) itself is called internally (a
-- SECURITY DEFINER function's internal calls run as its owner, unaffected
-- by the revokes below), so none of its existing logic -- owner-role
-- lookup, slug generation, branding, feature flags -- is duplicated.
create or replace function public.accept_firm_connection_invite(p_token uuid, p_name text, p_workspace_type text default 'independent_ptin'::text)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_workspace_id uuid;
begin
  if auth.uid() is null then
    raise exception 'accept_firm_connection_invite requires an authenticated user';
  end if;

  if not exists (
    select 1 from public.firm_connections
    where invite_token = p_token
      and status = 'pending'
      and child_workspace_id is null
      and invite_expires_at >= now()
  ) then
    raise exception 'This invite is invalid, expired, or has already been used.';
  end if;

  v_workspace_id := public.create_workspace(p_name, p_workspace_type);
  perform public.redeem_firm_connection_invite(p_token, v_workspace_id);

  return v_workspace_id;
end;
$function$;

revoke all on function public.accept_firm_connection_invite(uuid, text, text) from public, anon;
grant execute on function public.accept_firm_connection_invite(uuid, text, text) to authenticated;

-- Nothing legitimate calls create_workspace(text,text,text) directly
-- anymore: app/join now goes through accept_firm_connection_invite above,
-- and app/onboarding's self-serve form is being removed in the same
-- change (nothing else should ever create a workspace outside of a
-- platform-admin invite or a firm-connection invite).
revoke execute on function public.create_workspace(text, text, text) from public;
revoke execute on function public.create_workspace(text, text, text) from authenticated;
revoke execute on function public.create_workspace(text, text, text) from anon;
