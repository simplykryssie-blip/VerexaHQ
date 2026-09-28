-- Correction pass, accidental logic change B: 20261030020000_billing_seat_rpc_operational_gate.sql's
-- release_sponsored_staff_member fix (adding the operational gate) also
-- moved the `release_notice_sent_at = now()` update INSIDE the
-- `if v_recipient_email is not null` block. On current main
-- (20261012000002_sponsorship_transition_notifications_direct_insert.sql)
-- that update sits OUTSIDE/after that inner check, but still inside the
-- outer `if v_inserted and v_transition.release_notice_sent_at is null`
-- block -- so it always runs once per transition, even when the released
-- user has no email on file. The branch's version silently skipped it in
-- that case, leaving release_notice_sent_at null forever. Restoring main's
-- exact placement, with no other changes (the operational gate stays).
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
  if not public.is_workspace_operational(p_workspace_id) then
    raise exception 'this workspace is not currently operational';
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
