-- Re-opens self-serve signup, at the user's explicit request, scoped to a
-- single narrow entry point: the public "Start 14-Day Trial" flow on the
-- marketing site. create_workspace(text,text,text) itself stays revoked
-- from authenticated/anon (see 20260822060000_close_self_serve_signup_gap)
-- -- this mirrors accept_firm_connection_invite's exact pattern (a single
-- new SECURITY DEFINER entry point that validates its own precondition,
-- then calls the internal 3-arg create_workspace, whose internal call runs
-- as the function owner and is unaffected by the revokes) rather than
-- re-opening the general-purpose function itself.
--
-- Unlike the invite-acceptance path, there's no token to validate here --
-- that's the whole point of a public trial signup -- so the only guard is
-- "must be an authenticated (i.e. just-confirmed-their-email) user", same
-- baseline every other self-serve account-creation path in this app relies
-- on (email confirmation is the abuse gate, not an invite).
--
-- Also creates the workspace's first workspace_subscriptions row so the
-- trial has a real, queryable end date (trial_end) instead of only living
-- in marketing copy -- nothing enforces it yet (no cron pauses access at
-- day 14), matching how provision-workspace doesn't set up billing either;
-- that enforcement is a separate follow-up, not implied by just fixing the
-- signup button.
create or replace function public.start_trial_workspace(p_name text, p_plan_slug text default 'solo')
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_workspace_id uuid;
  v_plan_id uuid;
  v_workspace_type text;
begin
  if auth.uid() is null then
    raise exception 'start_trial_workspace requires an authenticated user';
  end if;

  select id into v_plan_id from public.platform_subscription_plans where slug = p_plan_slug;
  if v_plan_id is null then
    raise exception 'Unknown plan: %', p_plan_slug;
  end if;

  -- Solo is a one-person practice (no staff to invite); Team/Firm are
  -- multi-seat plans, which only make sense on a workspace type that can
  -- actually invite staff -- see isEroManagementTier()/canInviteStaff() in
  -- lib/workspaceCapabilities.ts. A trial signer can change this properly
  -- later (e.g. via Platform Admin) if it doesn't fit; this is just a
  -- sane default so a Team/Firm trial isn't paying for seats it can never
  -- use on day one.
  v_workspace_type := case when p_plan_slug = 'solo' then 'independent_ptin' else 'ero_office' end;

  v_workspace_id := public.create_workspace(p_name, v_workspace_type);

  insert into public.workspace_subscriptions (workspace_id, plan_id, stripe_status, trial_end)
  values (v_workspace_id, v_plan_id, 'trialing', now() + interval '14 days');

  return v_workspace_id;
end;
$function$;

revoke all on function public.start_trial_workspace(text, text) from public, anon;
grant execute on function public.start_trial_workspace(text, text) to authenticated;
