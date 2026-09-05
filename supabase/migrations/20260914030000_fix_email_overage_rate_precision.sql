-- Fixes the email overage rate, which was 10x too expensive live: the
-- Platform Admin > Plans form labels this field "Per email over included
-- ($)" and stores it as whole cents-per-single-email, but the real price
-- ($2.00 per 1,000 emails, Resend-style) is $0.002/email -- a fifth of a
-- cent, which an integer cents-per-email column can't represent at all.
-- Someone entering "the $2/1,000 rate" into that form could only ever
-- produce 2 cents/email ($20/1,000), which is exactly the bug found.
--
-- Renames the column (rather than just re-typing the number) so the unit
-- mismatch that caused this can't happen again: it now means cents per
-- 1,000 emails, matching how email overage is actually priced and quoted,
-- and $2.00/1,000 stores as a clean integer (200) with no precision loss.
-- sms_overage_rate_cents and storage_overage_rate_cents are unaffected --
-- both were already correct as true per-single-unit rates.
alter table public.platform_subscription_plans
  rename column email_overage_rate_cents to email_overage_rate_cents_per_1000;

comment on column public.platform_subscription_plans.email_overage_rate_cents_per_1000 is
  'Cents charged per 1,000 emails over the plan''s included amount (e.g. 200 = $2.00 per 1,000 emails). Deliberately per-1,000, not per-email -- the real rate needs fractional-cent precision an integer per-email column can''t hold.';

-- handle_plan_price_change's body references columns by name (not resolved
-- until it runs), so the rename above doesn't update it -- without this it
-- fails the moment a plan row is next updated at all, not just this one.
create or replace function public.handle_plan_price_change()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  ws record;
  v_effective date;
begin
  if new.base_price_cents is not distinct from old.base_price_cents
     and new.per_seat_price_cents is not distinct from old.per_seat_price_cents
     and new.email_overage_rate_cents_per_1000 is not distinct from old.email_overage_rate_cents_per_1000
     and new.storage_overage_rate_cents is not distinct from old.storage_overage_rate_cents
     and new.sms_overage_rate_cents is not distinct from old.sms_overage_rate_cents
  then
    return new;
  end if;

  for ws in
    select id, workspace_id, current_period_end
    from public.workspace_subscriptions
    where plan_id = new.id
      and price_change_effective_date is null
      and stripe_status <> 'canceled'
  loop
    v_effective := coalesce(ws.current_period_end, now())::date;
    while v_effective < (current_date + 60) loop
      v_effective := (v_effective + interval '1 month')::date;
    end loop;

    update public.workspace_subscriptions
    set price_change_notice_sent_at = now(),
        price_change_effective_date = v_effective
    where id = ws.id;

    insert into public.notification_queue (workspace_id, channel, template_key, event_type, payload, recipient_user_id, recipient_email, dedupe_key)
    select ws.workspace_id, 'Email', 'plan-price-change-notice', 'plan_price_change',
           jsonb_build_object('effective_date', v_effective, 'new_base_price', (new.base_price_cents::numeric / 100)),
           wu.user_id, u.email,
           'plan_price_change:' || ws.id || ':' || v_effective::text || ':' || wu.user_id::text
    from public.workspace_users wu
    join public.roles ro on ro.id = wu.role_id
    join auth.users u on u.id = wu.user_id
    where wu.workspace_id = ws.workspace_id
      and wu.status = 'active'
      and (wu.is_owner or ro.slug in ('owner', 'admin'))
    on conflict (workspace_id, template_key, dedupe_key) where dedupe_key is not null do nothing;
  end loop;

  return new;
end;
$function$;

update public.platform_subscription_plans
set email_overage_rate_cents_per_1000 = 200
where slug in ('solo', 'team', 'firm');
