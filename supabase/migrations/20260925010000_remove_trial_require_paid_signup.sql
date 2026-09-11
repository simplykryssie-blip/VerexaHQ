-- Removes the 14-day free trial entirely, at the user's explicit request:
-- someone used it just to scope out her product for their own, and going
-- forward every self-serve signup pays immediately -- no trial period, no
-- "no card required" promise, real money changes hands before a workspace
-- is usable.
--
-- create_trial_workspace (20260909200000) is dropped outright, not left
-- around unused -- it always set stripe_status='trialing' and a trial_end
-- 14 days out, which is exactly the behavior being removed. Replaced by
-- create_paid_workspace: same auth/one-workspace-per-account guards, but
-- the workspace_subscriptions row it inserts uses the column's own
-- 'incomplete' default (no trial_end at all) -- a real Stripe Checkout
-- subscription (see app/api/signup/checkout/route.ts) is what actually
-- moves it to 'active', the same webhook path (handleSubscriptionCreated)
-- every other subscription in this app already goes through.
--
-- Also new: p_plan_slug picks the workspace's type, not just its billing
-- tier -- Solo is a one-person practice (independent_ptin, no staff to
-- invite); Team/Firm are multi-seat plans, which only make sense on a
-- workspace type that can actually invite staff (see
-- isEroManagementTier()/canInviteStaff() in lib/workspaceCapabilities.ts).
-- This is the "choose what kind of account you want" gap being closed --
-- create_trial_workspace always forced independent_ptin regardless of
-- what was passed in, since a free trial had every reason to stay at the
-- lowest-blast-radius tier; a real paying signup doesn't.
drop function if exists public.create_trial_workspace(text, text, text);

create or replace function public.create_paid_workspace(
  p_name text,
  p_plan_slug text,
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
  v_workspace_type text;
  v_display_name text;
begin
  if v_uid is null then
    raise exception 'create_paid_workspace requires an authenticated user';
  end if;

  if not exists (select 1 from auth.users where id = v_uid and email_confirmed_at is not null) then
    raise exception 'Please confirm your email before continuing.';
  end if;

  if exists (select 1 from public.client_portal_users where user_id = v_uid and status = 'active') then
    raise exception 'this account is a client portal account and cannot create a staff workspace';
  end if;

  if exists (select 1 from public.workspace_users where user_id = v_uid and status = 'active') then
    raise exception 'This account is already connected to a workspace.';
  end if;

  select id into v_plan_id from public.platform_subscription_plans where slug = p_plan_slug and is_active limit 1;
  if v_plan_id is null then
    raise exception 'Unknown plan: %', p_plan_slug;
  end if;

  v_workspace_type := case when p_plan_slug = 'solo' then 'independent_ptin' else 'ero_office' end;

  v_workspace_id := public.create_workspace(coalesce(nullif(btrim(p_name), ''), 'My Firm'), v_workspace_type);

  -- No trial_end, no current_period_* -- those are only known once the
  -- Stripe subscription the checkout route creates actually exists;
  -- stripe_status keeps the column's 'incomplete' default until then.
  insert into public.workspace_subscriptions (workspace_id, plan_id)
  values (v_workspace_id, v_plan_id);

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

revoke all on function public.create_paid_workspace(text, text, text, text) from public, anon;
grant execute on function public.create_paid_workspace(text, text, text, text) to authenticated;
