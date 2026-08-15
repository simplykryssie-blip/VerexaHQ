-- Real mutation actions for the platform-admin dashboard, which was
-- read-only until now. All three are platform-admin-gated SECURITY DEFINER
-- RPCs rather than raw RLS write policies, so each action stays narrow
-- (exactly what it claims to do) instead of opening broad table access.

create or replace function public.set_workspace_status(p_workspace_id uuid, p_status text, p_suspension_reason text default null)
returns public.workspaces
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_row public.workspaces;
begin
  if not public.is_platform_admin() then
    raise exception 'insufficient permissions to change workspace status';
  end if;
  if p_status not in ('active', 'suspended', 'archived') then
    raise exception 'invalid status: %', p_status;
  end if;
  if p_suspension_reason is not null and p_suspension_reason not in ('billing_past_due', 'subscription_canceled') then
    raise exception 'invalid suspension reason: %', p_suspension_reason;
  end if;

  update public.workspaces
  set status = p_status,
      suspension_reason = case when p_status = 'suspended' then p_suspension_reason else null end,
      updated_at = now()
  where id = p_workspace_id
  returning * into v_row;

  if v_row.id is null then
    raise exception 'workspace % not found', p_workspace_id;
  end if;

  return v_row;
end;
$$;

create or replace function public.upsert_workspace_subscription(
  p_workspace_id uuid,
  p_plan_id uuid,
  p_stripe_status text default 'active',
  p_seat_count integer default 1
)
returns public.workspace_subscriptions
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_row public.workspace_subscriptions;
begin
  if not public.is_platform_admin() then
    raise exception 'insufficient permissions to manage workspace subscriptions';
  end if;

  insert into public.workspace_subscriptions (workspace_id, plan_id, stripe_status, seat_count)
  values (p_workspace_id, p_plan_id, p_stripe_status, p_seat_count)
  on conflict (workspace_id) do update
    set plan_id = excluded.plan_id,
        stripe_status = excluded.stripe_status,
        seat_count = excluded.seat_count,
        updated_at = now()
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.set_platform_admin(p_user_email text, p_is_platform_admin boolean)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_user_id uuid;
begin
  if not public.is_platform_admin() then
    raise exception 'insufficient permissions to change platform admin status';
  end if;

  select id into v_user_id from auth.users where email = p_user_email;
  if v_user_id is null then
    raise exception 'no user found with email %', p_user_email;
  end if;

  update public.user_profiles set is_platform_admin = p_is_platform_admin, updated_at = now() where id = v_user_id;
end;
$$;

revoke all on function public.set_workspace_status(uuid, text, text) from public, anon;
grant execute on function public.set_workspace_status(uuid, text, text) to authenticated;

revoke all on function public.upsert_workspace_subscription(uuid, uuid, text, integer) from public, anon;
grant execute on function public.upsert_workspace_subscription(uuid, uuid, text, integer) to authenticated;

revoke all on function public.set_platform_admin(text, boolean) from public, anon;
grant execute on function public.set_platform_admin(text, boolean) to authenticated;
