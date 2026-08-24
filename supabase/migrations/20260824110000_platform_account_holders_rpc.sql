-- Backs the Verexa HQ admin "Contacts" page: every real customer account
-- holder (workspace owner), with enough account/billing detail to answer a
-- support call or a "what plan are they on" question without hunting
-- across pages. Demo shells and Verexa HQ CRM's own ownership row are
-- excluded -- they aren't customers to market to or support.
create or replace function public.get_platform_account_holders()
returns table (
  workspace_id uuid,
  workspace_name text,
  workspace_type text,
  workspace_status text,
  workspace_created_at timestamptz,
  user_id uuid,
  display_name text,
  first_name text,
  last_name text,
  email text,
  phone text,
  plan_name text,
  stripe_status text,
  seat_count integer,
  current_period_end timestamptz,
  cancel_at_period_end boolean,
  last_payment_amount_cents integer,
  last_payment_at timestamptz
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select
    w.id,
    w.name,
    w.workspace_type,
    w.status,
    w.created_at,
    wu.user_id,
    up.display_name,
    up.first_name,
    up.last_name,
    au.email,
    up.phone,
    pp.name,
    ws.stripe_status,
    ws.seat_count,
    ws.current_period_end,
    ws.cancel_at_period_end,
    lp.amount_paid,
    lp.paid_at
  from public.workspaces w
  join public.workspace_users wu on wu.workspace_id = w.id and wu.is_owner = true and wu.status = 'active'
  join public.user_profiles up on up.id = wu.user_id
  join auth.users au on au.id = wu.user_id
  left join public.workspace_subscriptions ws on ws.workspace_id = w.id
  left join public.platform_subscription_plans pp on pp.id = ws.plan_id
  left join lateral (
    select amount_paid, paid_at
    from public.workspace_subscription_invoices wsi
    where wsi.workspace_id = w.id and wsi.status = 'paid'
    order by wsi.paid_at desc nulls last
    limit 1
  ) lp on true
  where w.is_demo = false
    and w.is_platform_home = false
    and public.is_platform_admin()
  order by w.created_at desc;
$function$;

revoke all on function public.get_platform_account_holders() from public, anon, authenticated;
grant execute on function public.get_platform_account_holders() to authenticated, service_role;
