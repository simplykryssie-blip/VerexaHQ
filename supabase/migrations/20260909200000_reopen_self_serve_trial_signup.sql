-- Self-serve signup was deliberately closed twice (20260820203000
-- lock_self_serve_signup, 20260822060000 close_self_serve_signup_gap) at
-- the user's own explicit request: every workspace provisioned by her,
-- invitee only sets a password. The marketing site's "Start your 14-day
-- trial" CTA has been quietly routing to a plain lead-capture form
-- ("A Verexa team member will reach out shortly") ever since, because
-- there was nowhere real to send it -- confirmed by grepping the app for
-- any actual self-serve signup route and finding none (app/join requires
-- a firm-connection invite token; app/onboarding is explicitly a dead end
-- for anyone without one). The user has now explicitly asked to reopen
-- self-serve signup, but only for trials, so this adds a single new,
-- narrowly-scoped entry point rather than re-granting the old
-- create_workspace(text,text,text,uuid) directly:
--   - requires a real authenticated session with a *confirmed* email
--     (blocks throwaway-address farming -- signUp alone doesn't clear this)
--   - refuses an account that already has an active workspace membership
--     (one trial workspace per account, not per click)
--   - refuses a client-portal account, same as create_workspace itself
--   - always provisions the lowest-blast-radius tier (independent_ptin,
--     one user) regardless of what's passed in -- upgrading to a Team/Firm
--     workspace_type is a staff/admin action elsewhere, not a self-serve
--     trial one
--   - attaches a real workspace_subscriptions row (plan "solo",
--     stripe_status 'trialing', trial_end now()+14 days) so Settings ->
--     Plan & Usage shows an honest trial countdown instead of no plan at
--     all -- no Stripe customer/subscription created, this is a
--     card-not-required trial
-- Kill switch if this needs to close again: revoke execute on
-- create_trial_workspace from authenticated (create_workspace's own
-- lockdown is untouched by this migration).
create or replace function public.create_trial_workspace(
  p_name text,
  p_first_name text default null,
  p_last_name text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_workspace_id uuid;
  v_plan_id uuid;
  v_display_name text;
begin
  if v_uid is null then
    raise exception 'create_trial_workspace requires an authenticated user';
  end if;

  if not exists (select 1 from auth.users where id = v_uid and email_confirmed_at is not null) then
    raise exception 'Please confirm your email before starting your trial.';
  end if;

  if exists (select 1 from public.client_portal_users where user_id = v_uid and status = 'active') then
    raise exception 'this account is a client portal account and cannot create a staff workspace';
  end if;

  if exists (select 1 from public.workspace_users where user_id = v_uid and status = 'active') then
    raise exception 'This account is already connected to a workspace.';
  end if;

  v_workspace_id := public.create_workspace(coalesce(nullif(btrim(p_name), ''), 'My Firm'), 'independent_ptin');

  select id into v_plan_id from public.platform_subscription_plans where slug = 'solo' and is_active limit 1;
  if v_plan_id is not null then
    insert into public.workspace_subscriptions (workspace_id, plan_id, stripe_status, trial_end, current_period_start, current_period_end)
    values (v_workspace_id, v_plan_id, 'trialing', now() + interval '14 days', now(), now() + interval '14 days');
  end if;

  v_display_name := nullif(btrim(concat_ws(' ', p_first_name, p_last_name)), '');
  if p_first_name is not null or p_last_name is not null or v_display_name is not null then
    update public.user_profiles
    set first_name = coalesce(p_first_name, first_name),
      last_name = coalesce(p_last_name, last_name),
      display_name = coalesce(v_display_name, display_name)
    where id = v_uid;
  end if;

  return v_workspace_id;
end;
$function$;

revoke all on function public.create_trial_workspace(text, text, text) from public, anon;
grant execute on function public.create_trial_workspace(text, text, text) to authenticated;
