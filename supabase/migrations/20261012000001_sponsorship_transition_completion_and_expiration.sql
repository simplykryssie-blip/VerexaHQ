-- Completes the sponsorship transition on successful personal payment, and
-- the hourly cron that sends the upcoming/final reminders and, once the
-- sponsorship_end_date actually arrives, ends the sponsor's access and
-- either finalizes the transition (if personal billing already succeeded)
-- or suspends the released user's personal workspace (if it never did).

-- ---------------------------------------------------------------------------
-- complete_sponsorship_transition_on_payment: called from the
-- invoice.payment_succeeded webhook handler (handleInvoicePaymentSucceeded),
-- never from subscription.created -- gating on the created event would
-- reintroduce the exact "granted before payment confirmed" bug already
-- flagged for grant_workspace_usage_meters. No-op unless this workspace is
-- actually the personal_workspace_id of a pending transition.
-- ---------------------------------------------------------------------------
create or replace function public.complete_sponsorship_transition_on_payment(p_workspace_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_transition record;
  v_plan_name text;
  v_plan_price_cents integer;
begin
  select st.*, p.name as plan_name, p.base_price_cents as plan_price_cents
  into v_transition
  from public.sponsorship_transitions st
  join public.platform_subscription_plans p on p.id = st.plan_id
  where st.personal_workspace_id = p_workspace_id and st.status = 'billing_setup_required';

  if v_transition.id is null then
    return;
  end if;

  update public.sponsorship_transitions
  set status = 'personal_billing_active', completed_at = now()
  where id = v_transition.id and status = 'billing_setup_required';

  if found and v_transition.activation_confirmation_sent_at is null then
    perform public.create_notification(
      p_workspace_id => null,
      p_recipient_user_id => v_transition.user_id,
      p_event_type => 'sponsorship_personal_billing_active',
      p_template_key => 'sponsorship-billing-active',
      p_channels => array['Email'],
      p_payload => jsonb_build_object(
        'plan_name', v_transition.plan_name,
        'monthly_price', to_char(v_transition.plan_price_cents / 100.0, 'FM$999,999,990.00')
      )
    );
    update public.sponsorship_transitions set activation_confirmation_sent_at = now() where id = v_transition.id;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- process_sponsorship_transition_reminders_and_expirations: hourly cron
-- (see app/api/cron/process-sponsorship-transitions/route.ts). Day-3 and
-- day-1 reminders follow the same chicagoDateStr/daysBetween day-threshold
-- pattern already used by check-billing-cycles, each guarded by its own
-- *_sent_at column so a retried/duplicate run is a no-op. On or after the
-- sponsorship_end_date, the sponsor's access always ends (that decision was
-- already final at release time, independent of personal-billing status),
-- and the transition either finalizes (personal billing already active) or
-- suspends the personal workspace via the same convention
-- pauseWorkspaceForBilling already uses elsewhere.
-- ---------------------------------------------------------------------------
create or replace function public.process_sponsorship_transition_reminders_and_expirations()
returns table (
  reminded_upcoming integer,
  reminded_final integer,
  completed_late integer,
  suspended integer,
  sponsor_access_ended integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
  v_days_until integer;
  v_reminded_upcoming integer := 0;
  v_reminded_final integer := 0;
  v_completed_late integer := 0;
  v_suspended integer := 0;
  v_sponsor_access_ended integer := 0;
  v_still_active boolean;
begin
  for v_row in
    select st.*, w.name as sponsor_name, p.name as plan_name, p.base_price_cents as plan_price_cents
    from public.sponsorship_transitions st
    join public.workspaces w on w.id = st.sponsor_workspace_id
    join public.platform_subscription_plans p on p.id = st.plan_id
    where st.status = 'billing_setup_required'
  loop
    v_days_until := (
      (v_row.sponsorship_end_date at time zone 'America/Chicago')::date
      - (now() at time zone 'America/Chicago')::date
    );

    if v_days_until = 3 and v_row.upcoming_reminder_sent_at is null then
      perform public.create_notification(
        p_workspace_id => null, p_recipient_user_id => v_row.user_id,
        p_event_type => 'sponsorship_upcoming_reminder', p_template_key => 'sponsorship-upcoming-reminder',
        p_channels => array['Email'],
        p_payload => jsonb_build_object(
          'firm_name', v_row.sponsor_name,
          'sponsorship_end_date', to_char(v_row.sponsorship_end_date, 'FMMonth FMDD, YYYY'),
          'plan_name', v_row.plan_name,
          'monthly_price', to_char(v_row.plan_price_cents / 100.0, 'FM$999,999,990.00')
        )
      );
      update public.sponsorship_transitions set upcoming_reminder_sent_at = now() where id = v_row.id;
      v_reminded_upcoming := v_reminded_upcoming + 1;
    end if;

    if v_days_until = 1 and v_row.final_reminder_sent_at is null then
      perform public.create_notification(
        p_workspace_id => null, p_recipient_user_id => v_row.user_id,
        p_event_type => 'sponsorship_final_reminder', p_template_key => 'sponsorship-final-reminder',
        p_channels => array['Email'],
        p_payload => jsonb_build_object(
          'firm_name', v_row.sponsor_name,
          'sponsorship_end_date', to_char(v_row.sponsorship_end_date, 'FMMonth FMDD, YYYY'),
          'plan_name', v_row.plan_name,
          'monthly_price', to_char(v_row.plan_price_cents / 100.0, 'FM$999,999,990.00')
        )
      );
      update public.sponsorship_transitions set final_reminder_sent_at = now() where id = v_row.id;
      v_reminded_final := v_reminded_final + 1;
    end if;

    if v_days_until <= 0 then
      -- The sponsor relationship ends today regardless of personal-billing
      -- status -- this was already decided at release time. Reuses
      -- revoke_workspace_user's exact effect (status='removed'); only acts
      -- if still active, so a retried cron run is a no-op here.
      update public.workspace_users
      set status = 'removed'
      where workspace_id = v_row.sponsor_workspace_id and user_id = v_row.user_id and status = 'active';
      if found then
        v_sponsor_access_ended := v_sponsor_access_ended + 1;
      end if;
      update public.sponsorship_transitions set sponsor_removed_at = now() where id = v_row.id and sponsor_removed_at is null;

      -- Re-check live rather than trusting only the loop snapshot, in case
      -- the payment-success webhook landed a moment ago.
      select (stripe_status = 'active') into v_still_active
      from public.workspace_subscriptions where workspace_id = v_row.personal_workspace_id;

      if coalesce(v_still_active, false) then
        update public.sponsorship_transitions set status = 'personal_billing_active', completed_at = now()
        where id = v_row.id and status = 'billing_setup_required';
        v_completed_late := v_completed_late + 1;
      else
        update public.sponsorship_transitions set status = 'suspended', suspended_at = now()
        where id = v_row.id and status = 'billing_setup_required';
        -- Same suspension convention pauseWorkspaceForBilling already uses
        -- elsewhere in this codebase -- only if they got as far as creating
        -- a personal workspace but never completed payment for it.
        if v_row.personal_workspace_id is not null then
          update public.workspaces
          set status = 'suspended', suspension_reason = 'billing_past_due'
          where id = v_row.personal_workspace_id and status = 'active';
        end if;
        v_suspended := v_suspended + 1;
      end if;
    end if;
  end loop;

  return query select v_reminded_upcoming, v_reminded_final, v_completed_late, v_suspended, v_sponsor_access_ended;
end;
$$;

-- Neither function checks auth.uid() -- both trust their caller entirely
-- (the webhook handler resolves p_workspace_id from a verified Stripe
-- event; the cron is CRON_SECRET-gated). Postgres grants PUBLIC execute on
-- a new function by default, which would let any authenticated user call
-- complete_sponsorship_transition_on_payment with an arbitrary workspace_id
-- and fake their own transition into personal_billing_active with no
-- payment at all -- revoke that default and restrict both to service_role.
revoke execute on function public.complete_sponsorship_transition_on_payment(uuid) from public, anon, authenticated;
revoke execute on function public.process_sponsorship_transition_reminders_and_expirations() from public, anon, authenticated;
grant execute on function public.complete_sponsorship_transition_on_payment(uuid) to service_role;
grant execute on function public.process_sponsorship_transition_reminders_and_expirations() to service_role;
