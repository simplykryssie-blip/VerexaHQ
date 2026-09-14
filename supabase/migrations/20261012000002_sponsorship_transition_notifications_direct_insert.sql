-- Fixes a real send bug in the first sponsorship-transition migrations:
-- create_notification() inserts recipient_user_id but never recipient_email,
-- and dispatch-notifications/route.ts hard-requires job.recipient_email AND
-- a non-null job.workspace_id for every Email-channel job (throws "Job has
-- no recipient_email" / "Job has no workspace_id" otherwise) -- so all 4
-- sponsorship emails would have sat in notification_queue, retried, and
-- dead-lettered without ever sending. Switches all 4 sends to the same
-- direct notification_queue insert shape check-billing-cycles/route.ts
-- already uses (recipient_email resolved from auth.users, a real
-- workspace_id, and a dedupe_key), instead of create_notification.
--
-- workspace_id choice for template routing: sponsor_workspace_id for the
-- three pre-completion notices (release, upcoming, final -- all about the
-- sponsor's billing period ending), personal_workspace_id for the
-- activation confirmation (about the new personal subscription). This
-- mirrors the exact same "workspace admin could in principle override the
-- platform template for jobs addressed within their own workspace" property
-- billing-card-reminder/billing-payment-failed already carry (email_templates
-- RLS lets any workspace admin insert a row under their own workspace_id
-- with any slug) -- an accepted, pre-existing platform characteristic, not
-- something new introduced here, and never a way for a sponsor to reach a
-- job addressed to a *different* workspace.

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
  v_recipient_email text;
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
    select email into v_recipient_email from auth.users where id = p_user_id;
    if v_recipient_email is not null then
      insert into public.notification_queue (
        workspace_id, channel, channels, template_key, event_type, payload,
        recipient_user_id, recipient_email, dedupe_key
      ) values (
        p_workspace_id, 'Email', array['Email'], 'sponsorship-release-notice', 'sponsorship_release_notice',
        jsonb_build_object(
          'firm_name', v_sponsor_name,
          'sponsorship_end_date', to_char(v_period_end, 'FMMonth FMDD, YYYY'),
          'plan_name', v_plan_name,
          'monthly_price', to_char(v_plan_price_cents / 100.0, 'FM$999,999,990.00')
        ),
        p_user_id, v_recipient_email, 'sponsorship-release-notice:' || v_transition.id
      );
    end if;
    update public.sponsorship_transitions set release_notice_sent_at = now() where id = v_transition.id;
  end if;

  return v_transition;
end;
$$;

create or replace function public.complete_sponsorship_transition_on_payment(p_workspace_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_transition record;
  v_recipient_email text;
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
    select email into v_recipient_email from auth.users where id = v_transition.user_id;
    if v_recipient_email is not null then
      insert into public.notification_queue (
        workspace_id, channel, channels, template_key, event_type, payload,
        recipient_user_id, recipient_email, dedupe_key
      ) values (
        p_workspace_id, 'Email', array['Email'], 'sponsorship-billing-active', 'sponsorship_personal_billing_active',
        jsonb_build_object(
          'plan_name', v_transition.plan_name,
          'monthly_price', to_char(v_transition.plan_price_cents / 100.0, 'FM$999,999,990.00')
        ),
        v_transition.user_id, v_recipient_email, 'sponsorship-billing-active:' || v_transition.id
      );
    end if;
    update public.sponsorship_transitions set activation_confirmation_sent_at = now() where id = v_transition.id;
  end if;
end;
$$;

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
  v_recipient_email text;
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
      select email into v_recipient_email from auth.users where id = v_row.user_id;
      if v_recipient_email is not null then
        insert into public.notification_queue (
          workspace_id, channel, channels, template_key, event_type, payload,
          recipient_user_id, recipient_email, dedupe_key
        ) values (
          v_row.sponsor_workspace_id, 'Email', array['Email'], 'sponsorship-upcoming-reminder', 'sponsorship_upcoming_reminder',
          jsonb_build_object(
            'firm_name', v_row.sponsor_name,
            'sponsorship_end_date', to_char(v_row.sponsorship_end_date, 'FMMonth FMDD, YYYY'),
            'plan_name', v_row.plan_name,
            'monthly_price', to_char(v_row.plan_price_cents / 100.0, 'FM$999,999,990.00')
          ),
          v_row.user_id, v_recipient_email, 'sponsorship-upcoming-reminder:' || v_row.id
        );
      end if;
      update public.sponsorship_transitions set upcoming_reminder_sent_at = now() where id = v_row.id;
      v_reminded_upcoming := v_reminded_upcoming + 1;
    end if;

    if v_days_until = 1 and v_row.final_reminder_sent_at is null then
      select email into v_recipient_email from auth.users where id = v_row.user_id;
      if v_recipient_email is not null then
        insert into public.notification_queue (
          workspace_id, channel, channels, template_key, event_type, payload,
          recipient_user_id, recipient_email, dedupe_key
        ) values (
          v_row.sponsor_workspace_id, 'Email', array['Email'], 'sponsorship-final-reminder', 'sponsorship_final_reminder',
          jsonb_build_object(
            'firm_name', v_row.sponsor_name,
            'sponsorship_end_date', to_char(v_row.sponsorship_end_date, 'FMMonth FMDD, YYYY'),
            'plan_name', v_row.plan_name,
            'monthly_price', to_char(v_row.plan_price_cents / 100.0, 'FM$999,999,990.00')
          ),
          v_row.user_id, v_recipient_email, 'sponsorship-final-reminder:' || v_row.id
        );
      end if;
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
