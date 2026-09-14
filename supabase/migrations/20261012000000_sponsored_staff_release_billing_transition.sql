-- Released-staff sponsorship transfer: when an ERO/SB releases a sponsored
-- staff member, they keep access through the sponsor's already-paid billing
-- period, then must explicitly set up their own personal Verexa billing
-- (reusing the existing self-serve signup checkout, never auto-charged, never
-- auto-subscribed) or be suspended once that period ends.
--
-- Deliberately reuses, unmodified: create_workspace (its p_owner_user_id path
-- is untouched; this always calls it with no owner override so it resolves
-- auth.uid() itself), revoke_workspace_user's exact update shape, the
-- pauseWorkspaceForBilling suspension convention (workspaces.status/
-- suspension_reason='billing_past_due'), create_notification, and the
-- platform-level (workspace_id IS NULL) email_templates pattern already used
-- by billing-card-reminder/billing-payment-failed. Does not touch
-- workspace_subscriptions.seat_count, firm-connection billing takeover, or
-- any existing signup/checkout code path.

create table public.sponsorship_transitions (
  id uuid primary key default gen_random_uuid(),
  sponsor_workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  released_by uuid references auth.users(id) on delete set null,
  released_at timestamptz not null default now(),
  sponsorship_end_date timestamptz not null,
  plan_id uuid not null references public.platform_subscription_plans(id),
  personal_workspace_id uuid references public.workspaces(id),
  status text not null default 'billing_setup_required' check (status in ('billing_setup_required', 'personal_billing_active', 'suspended')),
  completed_at timestamptz,
  suspended_at timestamptz,
  sponsor_removed_at timestamptz,
  release_notice_sent_at timestamptz,
  upcoming_reminder_sent_at timestamptz,
  final_reminder_sent_at timestamptz,
  activation_confirmation_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Only one live (non-terminal) transition per user at a time -- a duplicate
-- release call (double-click, retried cron/job) is absorbed into the
-- existing row rather than creating a second one (edge case E).
create unique index sponsorship_transitions_active_per_user
  on public.sponsorship_transitions (user_id)
  where status = 'billing_setup_required';

create index sponsorship_transitions_sponsor_idx on public.sponsorship_transitions (sponsor_workspace_id);
create index sponsorship_transitions_personal_workspace_idx on public.sponsorship_transitions (personal_workspace_id);

create trigger set_updated_at
  before update on public.sponsorship_transitions
  for each row execute function public.set_updated_at();

alter table public.sponsorship_transitions enable row level security;

-- Read: the released user themselves, an admin of the sponsoring workspace,
-- or a platform admin. No direct client writes at all -- every state change
-- goes through the SECURITY DEFINER RPCs below.
create policy sponsorship_transitions_select on public.sponsorship_transitions
  for select using (
    user_id = auth.uid()
    or public.is_workspace_admin(sponsor_workspace_id)
    or public.is_platform_admin()
  );

create policy sponsorship_transitions_no_direct_write on public.sponsorship_transitions
  for all using (false) with check (false);

-- ---------------------------------------------------------------------------
-- release_sponsored_staff_member: an ERO/SB admin releases a staff member.
-- Does NOT touch workspace_users.status -- the released person keeps their
-- existing active access at the sponsor workspace through
-- sponsorship_end_date; that access is only removed later, by the
-- process-sponsorship-transitions cron, once the period actually ends.
-- ---------------------------------------------------------------------------
create or replace function public.release_sponsored_staff_member(p_workspace_id uuid, p_user_id uuid)
returns public.sponsorship_transitions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_period_end timestamptz;
  v_plan_id uuid;
  v_plan_name text;
  v_plan_price_cents integer;
  v_sponsor_name text;
  v_member record;
  v_transition public.sponsorship_transitions;
  v_inserted boolean := false;
begin
  if not public.is_workspace_admin(p_workspace_id) then
    raise exception 'insufficient permissions to release members from this workspace';
  end if;

  select * into v_member from public.workspace_users where workspace_id = p_workspace_id and user_id = p_user_id and status = 'active';
  if v_member.user_id is null then
    raise exception 'this person is not an active member of this workspace';
  end if;
  if v_member.is_owner then
    raise exception 'the workspace owner cannot be released';
  end if;

  select current_period_end, w.name into v_period_end, v_sponsor_name
  from public.workspace_subscriptions ws join public.workspaces w on w.id = ws.workspace_id
  where ws.workspace_id = p_workspace_id;
  if v_period_end is null then
    raise exception 'this workspace has no active billing period to base a sponsorship transition on';
  end if;

  select id, name, base_price_cents into v_plan_id, v_plan_name, v_plan_price_cents
  from public.platform_subscription_plans where slug = 'solo' and is_active limit 1;
  if v_plan_id is null then
    raise exception 'the solo plan is not configured';
  end if;

  insert into public.sponsorship_transitions (sponsor_workspace_id, user_id, released_by, sponsorship_end_date, plan_id)
  values (p_workspace_id, p_user_id, auth.uid(), v_period_end, v_plan_id)
  on conflict (user_id) where status = 'billing_setup_required' do nothing
  returning * into v_transition;

  if v_transition.id is not null then
    v_inserted := true;
  else
    select * into v_transition from public.sponsorship_transitions where user_id = p_user_id and status = 'billing_setup_required';
  end if;

  if v_inserted and v_transition.release_notice_sent_at is null then
    perform public.create_notification(
      p_workspace_id => null,
      p_recipient_user_id => p_user_id,
      p_event_type => 'sponsorship_release_notice',
      p_template_key => 'sponsorship-release-notice',
      p_channels => array['Email'],
      p_payload => jsonb_build_object(
        'firm_name', v_sponsor_name,
        'sponsorship_end_date', to_char(v_period_end, 'FMMonth FMDD, YYYY'),
        'plan_name', v_plan_name,
        'monthly_price', to_char(v_plan_price_cents / 100.0, 'FM$999,999,990.00'),
        'transition_id', v_transition.id
      )
    );
    update public.sponsorship_transitions set release_notice_sent_at = now() where id = v_transition.id;
  end if;

  return v_transition;
end;
$$;

-- ---------------------------------------------------------------------------
-- get_my_sponsorship_transition: the caller's own pending transition, with
-- enough joined context (sponsor name, plan name/price) for the UI banner.
-- ---------------------------------------------------------------------------
create or replace function public.get_my_sponsorship_transition()
returns table (
  id uuid,
  sponsor_workspace_id uuid,
  sponsor_workspace_name text,
  sponsorship_end_date timestamptz,
  plan_name text,
  base_price_cents integer,
  personal_workspace_id uuid,
  status text
)
language sql
security definer
stable
set search_path = public
as $$
  select
    st.id, st.sponsor_workspace_id, w.name, st.sponsorship_end_date,
    p.name, p.base_price_cents, st.personal_workspace_id, st.status
  from public.sponsorship_transitions st
  join public.workspaces w on w.id = st.sponsor_workspace_id
  join public.platform_subscription_plans p on p.id = st.plan_id
  where st.user_id = auth.uid() and st.status = 'billing_setup_required'
  order by st.released_at desc
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- start_personal_billing_setup: called when the released user clicks
-- "Set Up My Billing." Creates (or reuses) a personal independent_ptin
-- workspace and its bare workspace_subscriptions row -- the exact same shape
-- create_paid_workspace already uses for ordinary self-serve signup -- but
-- never creates a Stripe subscription or charges anything here. The caller
-- is responsible for switching into the returned workspace (via the existing
-- /api/workspace/switch route) and then calling the existing
-- /api/signup/checkout route, exactly like any new solo signup.
-- ---------------------------------------------------------------------------
create or replace function public.start_personal_billing_setup()
returns table (workspace_id uuid, plan_slug text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_transition record;
  v_uid uuid := auth.uid();
  v_workspace_id uuid;
  v_display_name text;
begin
  if v_uid is null then
    raise exception 'start_personal_billing_setup requires an authenticated user';
  end if;

  select * into v_transition from public.sponsorship_transitions
  where user_id = v_uid and status = 'billing_setup_required';
  if v_transition.id is null then
    raise exception 'no pending sponsorship transition for this account';
  end if;

  if v_transition.personal_workspace_id is not null then
    return query select v_transition.personal_workspace_id, 'solo'::text;
    return;
  end if;

  -- Reuse an eligible personal workspace the user already owns (an
  -- independent_ptin workspace they own with no active paid subscription
  -- yet) rather than creating a second one -- edge case F.
  select w.id into v_workspace_id
  from public.workspaces w
  join public.workspace_users wu on wu.workspace_id = w.id
  left join public.workspace_subscriptions ws on ws.workspace_id = w.id
  where wu.user_id = v_uid and wu.is_owner and wu.status = 'active'
    and w.workspace_type = 'independent_ptin'
    and (ws.stripe_status is null or ws.stripe_status <> 'active')
  order by w.created_at asc
  limit 1;

  if v_workspace_id is null then
    select nullif(btrim(concat_ws(' ', first_name, last_name)), '') into v_display_name
    from public.user_profiles where id = v_uid;
    v_workspace_id := public.create_workspace(coalesce(v_display_name, 'My Firm'), 'independent_ptin');
  end if;

  insert into public.workspace_subscriptions (workspace_id, plan_id)
  values (v_workspace_id, v_transition.plan_id)
  on conflict (workspace_id) do nothing;

  update public.sponsorship_transitions set personal_workspace_id = v_workspace_id where id = v_transition.id;

  return query select v_workspace_id, 'solo'::text;
end;
$$;

grant execute on function public.release_sponsored_staff_member(uuid, uuid) to authenticated;
grant execute on function public.get_my_sponsorship_transition() to authenticated;
grant execute on function public.start_personal_billing_setup() to authenticated;
