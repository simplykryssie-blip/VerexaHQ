-- Live-tested (fixture prefix 60e00000-) and found start_personal_billing_setup
-- completely broken: "on conflict (workspace_id)" in its
-- workspace_subscriptions insert is ambiguous between the table's own
-- workspace_id column and this function's RETURNS TABLE (workspace_id, ...)
-- OUT parameter of the same name -- plpgsql doesn't resolve that on its own,
-- it raises "column reference \"workspace_id\" is ambiguous". Neither is
-- ever read as a bare plpgsql variable in this function (the local
-- v_workspace_id is used for that instead), so #variable_conflict
-- use_column -- preferring the SQL column whenever this exact ambiguity
-- comes up -- is always correct here and fixes the entire "Set Up My
-- Billing" flow.

create or replace function public.start_personal_billing_setup()
returns table (workspace_id uuid, plan_slug text)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
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
